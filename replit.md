# Overview

Obviu.io is a full-stack web application similar to Frame.io, designed for video collaboration and review. The platform allows teams to upload video/audio/image files, provide timestamped comments on media timelines, and manage approval workflows. The application is built with React and TypeScript on the frontend, Express.js and Node.js on the backend, and uses PostgreSQL for data persistence. It's optimized for self-hosted deployment on Ubuntu servers with Docker support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI components with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Authentication**: Session-based authentication with JWT tokens
- **Theme System**: Context-based theme provider supporting light, dark, and system themes with localStorage persistence for guest users and database storage for authenticated users

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Session Management**: Express sessions with PostgreSQL session store using connect-pg-simple
- **Authentication**: Passport.js with local strategy for username/password authentication
- **File Upload**: Multer middleware for handling large file uploads (up to 5GB)
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Migration System**: SQL-based migrations with automated execution during container startup

### Data Storage Solutions
- **Primary Database**: PostgreSQL with the following core tables:
  - users: User accounts with role-based access (admin/user) and theme preferences
  - projects: Project containers for organizing media files
  - files: Media file metadata with bigint file sizes to support large uploads
  - comments: Timestamped comments linked to specific media files
  - approvals: Approval workflow states for review processes
  - project_users: Many-to-many relationship for project access control
- **File Storage**: Local filesystem storage with configurable upload directory
- **Session Storage**: PostgreSQL-based session persistence

### Authentication and Authorization
- **Session-based Authentication**: Secure session cookies with configurable expiration
- **Role-based Access Control**: Admin and user roles with different permission levels
- **Password Security**: Salted and hashed passwords using crypto module
- **Password Reset**: Email-based password reset workflow with temporary tokens
- **Registration Control**: Configurable registration disable via VITE_DISABLE_REGISTRATION environment variable for Docker deployments

### Key Features Implementation
- **Media Timeline Comments**: Timestamped comments system allowing precise feedback on video content
- **Approval Workflow**: Request changes or approve functionality with threaded comment support
- **File Preview**: Browser-native HTML5 video/audio players with custom controls
- **Large File Support**: Optimized for uploads up to 5GB with proper Nginx configuration
- **Adobe Premiere Integration**: Export functionality for comments and timeline markers
- **Email Notifications**: SendGrid integration for user invitations and workflow notifications

### Deployment Architecture
- **Containerization**: Multi-stage Docker builds with separate builder and production stages
- **Container Orchestration**: Docker Compose with separate services for app, database, and reverse proxy
- **Database Initialization**: Automated schema setup and admin user creation on first run
- **Migration Handling**: Robust migration system that handles both fresh installs and updates
- **Health Checks**: Database connectivity verification before application startup
- **Volume Management**: Persistent volumes for database data and uploaded files

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database driver optimized for serverless environments
- **drizzle-orm**: Type-safe ORM for database operations and schema management
- **express**: Web application framework for the API server
- **multer**: Multipart form data handling for file uploads
- **passport**: Authentication middleware with local strategy support
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### UI and Frontend Libraries
- **@radix-ui/***: Comprehensive set of accessible UI components
- **@tailwindcss/vite**: Tailwind CSS integration with Vite build system
- **@tanstack/react-query**: Server state management and caching
- **react-hook-form**: Form state management with validation
- **class-variance-authority**: Type-safe CSS class variants
- **clsx**: Conditional CSS class utility

### Email and Communication
- **@sendgrid/mail**: Email service integration for notifications and user invitations

### Development and Build Tools
- **vite**: Fast frontend build tool with hot module replacement
- **typescript**: Type safety across the entire application
- **esbuild**: Fast JavaScript bundler for server-side code
- **drizzle-kit**: Database migration and schema management tools

### Infrastructure Dependencies
- **PostgreSQL 16**: Primary database with full-text search capabilities
- **Docker**: Containerization platform for consistent deployments
- **Nginx**: Reverse proxy and load balancer (optional, for production deployments)
- **SendGrid**: Email delivery service for notifications
- **Node.js 20**: JavaScript runtime environment