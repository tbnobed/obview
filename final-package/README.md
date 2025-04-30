# OBview.io - Media Review and Collaboration Platform

Welcome to OBview.io, a powerful media review and collaboration platform designed for teams to streamline their feedback process on video, images, and documents.

![OBview.io Logo](https://obview.io/assets/logo.png)

## Features

- **Timeline-based Commenting**: Attach comments to specific timestamps in videos
- **Drawing & Annotation**: Add visual markup to pinpoint feedback on images and videos
- **Version Control**: Track changes and compare versions of media files
- **Team Collaboration**: Flexible role-based permission system
- **Real-time Updates**: Get notified when comments are added or resolved
- **Project Management**: Organize files into projects with customizable states
- **Approval Workflow**: Streamline your review process with approval states
- **Self-hosted**: Full control over your data and infrastructure

## Quick Start

To quickly get OBview.io running on your server:

1. Upload and extract the installation package
2. Run the installation script
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh
   ```
3. Access the application at `http://your-server-ip`
4. Log in with the default admin credentials:
   - Username: `admin`
   - Password: `admin`
5. Change the default password immediately

## Documentation

For detailed instructions, please refer to:

- [DEPLOYMENT.md](DEPLOYMENT.md): Step-by-step guide to deploying OBview.io
- [CONFIGURATION.md](CONFIGURATION.md): Customizing and configuring your installation
- [check-database.js](check-database.js): Tool for database maintenance
- [healthcheck.js](healthcheck.js): System health monitoring tool
- [password-util.js](password-util.js): User account management utility

## System Requirements

- Ubuntu 20.04 LTS or newer
- Node.js 18.x or newer
- PostgreSQL 14.x or newer
- 2GB RAM minimum
- 20GB storage minimum

## Tools & Utilities

OBview.io comes with several useful utilities:

- **backup.sh**: Creates backups of your database and uploaded files
- **restore.sh**: Restores your system from a backup
- **healthcheck.js**: Diagnoses system health and connectivity issues
- **check-database.js**: Database schema verification and repair tool
- **password-util.js**: Password management utility

## Backup & Restore

To back up your OBview.io installation:

```bash
cd /opt/obview
sudo ./backup.sh
```

To restore from a backup:

```bash
cd /opt/obview
sudo ./restore.sh /path/to/backup/file.tar.gz
```

## Security

After installation, be sure to:

1. Change the default admin password
2. Update the database password 
3. Enable HTTPS with SSL certificates
4. Configure a firewall
5. Set up regular backups

See [CONFIGURATION.md](CONFIGURATION.md) for detailed security recommendations.

## Support & Troubleshooting

If you encounter issues:

1. Use the `healthcheck.js` tool to diagnose common problems
2. Check the system logs: `sudo journalctl -u obview`
3. Refer to the troubleshooting section in [DEPLOYMENT.md](DEPLOYMENT.md)

## License

OBview.io is licensed under proprietary terms. Please contact your administrator for licensing information.

---

&copy; 2025 OBview.io. All rights reserved.