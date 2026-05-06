# Dallas edge runbook

A nginx (NPM) buffer-and-forward edge that terminates `tbn.obviu.io` and
`t.obviu.io` for the office sites. The edge absorbs each tus PATCH at
LAN speed (~1ms RTT) and replays it to the obviu origin over the
UniFi SiteMagic mesh (~3 Gb/s). Combined with the client-side parallel
tus we ship in `client/src/lib/upload-service.ts`, this removes the
single-flow TCP throughput cap that was holding office uploads at
~9 MB/s.

This directory is config + runbook only. No app code lives here.

## Topology

```
Office --(LAN/ISP, ~1ms)--> Dallas edge VM ==(SiteMagic WG, ~3 Gb/s)==> obviu origin
                            tbn.obviu.io                                tbn.obviu.io
                            t.obviu.io                                  t.obviu.io
```

Same hostnames end-to-end. Cookies and tus IDs work transparently
because the client never sees a different domain.

## Files

- `nginx/http.conf` — drop into `/data/nginx/custom/http.conf` on the
  edge NPM. Defines the WebSocket upgrade map and the keepalive
  upstream pool to origin.
- `nginx/server_proxy.conf` — drop into
  `/data/nginx/custom/server_proxy.conf` on the edge NPM. Inverse of
  the origin's snippet: `proxy_request_buffering on` + spill-to-disk
  body buffer + tus header pass-through.

NPM auto-includes both files. **Do not copy them to the origin NPM** —
the origin needs `proxy_request_buffering off`.

## Deploy

1. **Provision the edge VM on Proxmox.**
   - Ubuntu 24.04, 2 vCPU, 4 GB RAM, 50+ GB disk for body buffer
     spills (`/var/cache/nginx/edge_body`). Disk size = max concurrent
     in-flight upload bytes; 50 GB handles ~12 simultaneous 4 GB
     uploads with headroom.
   - Connected to the office LAN segment that SiteMagic exposes,
     reachable from office endpoints on :443.

2. **Install Nginx Proxy Manager** (Docker):
   ```bash
   mkdir -p /opt/npm/{data,letsencrypt}
   cat > /opt/npm/docker-compose.yml <<'EOF'
   services:
     app:
       image: jc21/nginx-proxy-manager:latest
       restart: unless-stopped
       ports: ["80:80", "443:443", "81:81"]
       volumes:
         - ./data:/data
         - ./letsencrypt:/etc/letsencrypt
   EOF
   cd /opt/npm && docker compose up -d
   ```

3. **Drop the custom configs in:**
   ```bash
   mkdir -p /opt/npm/data/nginx/custom
   cp edge/nginx/http.conf          /opt/npm/data/nginx/custom/http.conf
   cp edge/nginx/server_proxy.conf  /opt/npm/data/nginx/custom/server_proxy.conf
   ```

4. **Edit `http.conf`** and set the `server` line under `upstream
   obviu_origin` to the origin's IP **as reachable over SiteMagic**
   (not the public IP). Keep port `443`.

5. **Add the body buffer spill dir inside the NPM container:**
   ```bash
   docker exec nginx-proxy-manager-app-1 mkdir -p /var/cache/nginx/edge_body
   docker exec nginx-proxy-manager-app-1 chown nginx: /var/cache/nginx/edge_body
   ```
   (Or bind-mount it from the host so it survives container restarts —
   not strictly required since spills are short-lived.)

6. **Issue TLS certs.** In NPM UI:
   - SSL Certificates → Add Lets Encrypt
   - Domains: `tbn.obviu.io`, `t.obviu.io`
   - **Use a DNS Challenge.** HTTP-01 will race with the origin's
     existing cert renewals. Configure the DNS provider plugin in NPM
     for whichever DNS host serves `obviu.io`.
   - Alternative: copy the wildcard `*.obviu.io` cert from the origin
     box if you already have one.

7. **Add proxy hosts.** In NPM UI, two hosts:
   - `tbn.obviu.io` → forward to `obviu_origin` (the upstream from
     `http.conf`) on port 443, scheme HTTPS, **block common exploits
     OFF**, **websockets ON**, **cache assets OFF**.
   - `t.obviu.io` → same.
   - Both with the SSL cert from step 6 and Force SSL ON.

   In the per-host **Advanced** tab, leave it empty. The custom
   `server_proxy.conf` is auto-included for every proxy host.

   ⚠️ Anything you put in the per-host Advanced field will be
   validated by NPM with `nginx -t -g "error_log off;"` which masks
   real errors, and on a failed validation NPM will **delete the
   entire host config** — the site goes down until you re-save it.
   Stick to the custom dir.

8. **Restart the NPM container** to pick up the custom configs:
   ```bash
   docker restart nginx-proxy-manager-app-1
   docker logs --tail 50 nginx-proxy-manager-app-1
   ```
   Look for `nginx: configuration file /etc/nginx/nginx.conf test is
   successful`. If it complains, the custom files are at fault — the
   per-host configs are fine because we left Advanced empty.

9. **Cut over the offices via UniFi DNS overrides.** In each office's
   UniFi controller:
   - Settings → Networks → (office LAN) → DHCP / DNS → Static DNS
     Records
   - `tbn.obviu.io` → edge VM's office-LAN IP
   - `t.obviu.io`   → edge VM's office-LAN IP
   - Public DNS stays pointed at origin. Home + everyone else is
     unaffected.

10. **Verify from an office client:**
    ```bash
    dig +short tbn.obviu.io       # should return the edge IP
    curl -I https://tbn.obviu.io  # should return the edge's TLS cert and hit origin
    ```
    Then upload a >100 MB file from the office; expect parallel-tus to
    saturate the LAN link (the edge absorbs everything locally) rather
    than the previous WAN cap.

## Tuning

- **WireGuard MTU.** SiteMagic uses WireGuard, MTU ~1420. If you see
  large uploads stalling on the edge → origin path, check for PMTUD
  black-holing on the WG interface and clamp TCP MSS:
  ```bash
  iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
      -j TCPMSS --clamp-mss-to-pmtu
  ```
  Or set the WG iface MTU explicitly to 1380 on both ends.

- **BBR.** Enable on the edge VM for the edge → origin path:
  ```bash
  echo 'net.core.default_qdisc=fq'           >> /etc/sysctl.d/99-bbr.conf
  echo 'net.ipv4.tcp_congestion_control=bbr' >> /etc/sysctl.d/99-bbr.conf
  sysctl --system
  ```
  (Origin already has BBR per the main repl.md gotcha.)

- **Concurrent-upload disk pressure.** If `/var/cache/nginx/edge_body`
  fills, uploads stall at the edge with 500s. Monitor with `df -h
  /var/cache/nginx/edge_body`; bump VM disk if needed.

## Failover

The cutover is just a UniFi DNS override. To revert to direct-to-origin
instantly:

1. Remove the two static DNS records from each affected office network.
2. Bounce the office's DNS clients (or wait for their lease).

You can script this with the UniFi controller API if you want
automatic failover, but the manual revert is ~30 seconds and
recoverable from anywhere with controller access.

## What this does NOT solve

- The edge → origin segment is still a single SiteMagic tunnel. With
  the parallel-tus client (4 concurrent backend connections per file)
  + keepalive pool you should saturate it well; if you ever do hit
  the 3 Gb/s ceiling, the next step is option 2 in the original plan
  (full store-and-forward tus relay with async replication).
- Read traffic (playback, thumbnails, API responses) is NOT cached at
  the edge. This is intentional for an MVP — caching media files
  introduces invalidation problems with the AI processing pipeline.
  Add a separate Cache-Control aware location block later if office
  read latency turns out to matter.
