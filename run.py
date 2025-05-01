from app import create_app, socketio, db
from app.models import User, Project, File, Comment, Approval, ProjectUser

app = create_app()

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
    with app.app_context():
        db.create_all()  # Create database tables if they don't exist
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)