from app import create_app, db
from app.models.user import User
from app.models.project import Project

def setup_database():
    """Initialize database with demo data"""
    print("Setting up database...")
    app = create_app()
    
    with app.app_context():
        # Create database tables
        db.create_all()
        
        # Check if admin user exists
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            # Create admin user
            admin = User(
                username='admin',
                email='admin@obview.io',
                name='Admin User',
                role='admin'
            )
            admin.set_password('admin123')  # In production, use a secure password
            db.session.add(admin)
            
            # Create demo project
            project = Project(
                name='Demo Project',
                description='This is a demonstration project for OBview.io',
                created_by_id=1  # Admin user will have ID 1
            )
            db.session.add(project)
            
            db.session.commit()
            print("Demo user created - Username: admin, Password: admin123")
            print("Demo project created")
        else:
            print("Admin user already exists")
    
    print("Database setup complete!")

if __name__ == '__main__':
    setup_database()