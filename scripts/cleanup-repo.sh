#!/bin/bash

# This script removes the attached_assets directory from Git history
# while keeping the files on your local machine.
#
# IMPORTANT: Before running this script:
# 1. Make sure all your changes are committed
# 2. Push your changes to any remote branches
# 3. Make a backup of your repository

echo "This script will remove the attached_assets folder from Git tracking."
echo "The files will remain on your local filesystem but won't be tracked by Git anymore."
echo ""
echo "After running this script, you'll need to force push to your remote repository."
echo ""
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Operation cancelled."
    exit 1
fi

echo "Removing attached_assets from Git tracking..."
git rm -r --cached attached_assets

echo "Updating .gitignore if needed..."
if ! grep -q "^attached_assets/$" .gitignore; then
    echo "attached_assets/" >> .gitignore
    echo "Added attached_assets/ to .gitignore"
else
    echo "attached_assets/ already in .gitignore"
fi

echo ""
echo "=== NEXT STEPS ==="
echo "1. Commit these changes:"
echo "   git commit -m \"Remove attached_assets from Git tracking\""
echo ""
echo "2. Force push to your remote repository:"
echo "   git push origin <branch-name> --force"
echo ""
echo "Note: Force pushing will rewrite history, so make sure all team members"
echo "are aware and pull the latest changes after you push."