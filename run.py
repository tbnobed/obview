import os
from app import create_app, socketio, db
from app.models import User, Project, File, Comment, Approval, ProjectUser
from config import config

# Get the environment configuration
config_name = os.getenv('FLASK_ENV', 'development')
app = create_app(config[config_name])

@app.shell_context_processor
def make_shell_context():
    return {
        'db': db,
        'User': User,
        'Project': Project,
        'File': File,
        'Comment': Comment,
        'Approval': Approval,
        'ProjectUser': ProjectUser
    }

if __name__ == '__main__':
    # Create all database tables
    with app.app_context():
        db.create_all()
    
    # Get port from environment or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Run the application with SocketIO
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        use_reloader=True,
        log_output=True,
        allow_unsafe_werkzeug=True
    )