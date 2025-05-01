#!/bin/bash
# Simple disk space monitoring script for OBview.io
# Recommended to be run via cron job to monitor server storage

set -e

# Configuration
THRESHOLD=80  # Alert when disk usage is above this percentage
CHECK_PATH="/app/uploads"  # Path to check - can be changed to your most important path
EMAIL=""  # Set this to receive email alerts (requires mail command)
SLACK_WEBHOOK=""  # Set this to post alerts to Slack

# Check disk space
check_disk_space() {
  DISK_USAGE=$(df -h "$1" | grep -v Filesystem | awk '{print $5}' | sed 's/%//')
  
  echo "Checking disk space for $1: ${DISK_USAGE}% used"
  
  if [ "$DISK_USAGE" -gt "$THRESHOLD" ]; then
    ALERT_MESSAGE="WARNING: Disk usage on $(hostname) for $1 is at ${DISK_USAGE}% - above threshold of ${THRESHOLD}%"
    echo "$ALERT_MESSAGE"
    
    # Return alert status
    return 1
  else
    echo "Disk usage is normal for $1 (${DISK_USAGE}%)"
    return 0
  fi
}

# Get detailed disk usage info for uploads directory
get_uploads_details() {
  echo "Top 10 largest directories in uploads folder:"
  du -h --max-depth=2 /app/uploads | sort -hr | head -10
  
  echo "Total uploads size:"
  du -sh /app/uploads
}

# Get database size
get_db_size() {
  # First try to use Docker Compose to get DB size info
  if command -v docker-compose &> /dev/null; then
    echo "Database size info (via Docker):"
    if docker-compose ps | grep -q db; then
      docker-compose exec -T db psql -U postgres -d obview -c "SELECT pg_size_pretty(pg_database_size('obview')) AS db_size;"
      return
    fi
  fi
  
  # Fallback to direct connection if Docker Compose not available
  if [ -n "$DATABASE_URL" ]; then
    echo "Database size info (via direct connection):"
    # Extract connection info from DATABASE_URL
    DB_USER=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/\(.*\):.*@.*$/\1/')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/.*:\(.*\)@.*$/\1/')
    DB_HOST=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):.*\/.*$/\1/')
    DB_PORT=$(echo $DATABASE_URL | sed -e 's/^.*@.*:\(.*\)\/.*$/\1/')
    DB_NAME=$(echo $DATABASE_URL | sed -e 's/^.*\/\(.*\)$/\1/')
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS db_size;"
  else
    echo "DATABASE_URL not set and Docker not available. Skipping database size check."
  fi
}

# Send alert via email
send_email_alert() {
  if [ -n "$EMAIL" ]; then
    echo "$1" | mail -s "Disk Space Alert: $(hostname)" "$EMAIL"
    echo "Email alert sent to $EMAIL"
  fi
}

# Send alert via Slack
send_slack_alert() {
  if [ -n "$SLACK_WEBHOOK" ]; then
    curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"$1\"}" "$SLACK_WEBHOOK"
    echo "Slack alert sent"
  fi
}

# Main execution
echo "OBview.io Disk Monitor - $(date)"
echo "-----------------------------------"

# Check system disk space
check_disk_space "/" || {
  ALERT_MESSAGE="System disk space is running low ($(df -h / | grep -v Filesystem | awk '{print $5}') used)"
  send_email_alert "$ALERT_MESSAGE"
  send_slack_alert "$ALERT_MESSAGE"
}

# Check uploads disk space if it exists
if [ -d "$CHECK_PATH" ]; then
  check_disk_space "$CHECK_PATH" || {
    # Get detailed info if threshold exceeded
    DETAILS=$(get_uploads_details)
    ALERT_MESSAGE="Uploads directory is running low on space\n\n$DETAILS"
    send_email_alert "$ALERT_MESSAGE"
    send_slack_alert "$ALERT_MESSAGE"
  }
else
  echo "Uploads directory $CHECK_PATH does not exist. Skipping check."
fi

# General disk usage report
echo -e "\nGeneral Disk Report:"
df -h

# Get detailed uploads info regardless of alert status
echo -e "\nUploads Usage Details:"
get_uploads_details

# Database size info
echo -e "\nDatabase Size Info:"
get_db_size

echo -e "\nDisk monitoring completed at $(date)"