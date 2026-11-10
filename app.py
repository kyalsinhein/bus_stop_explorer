from flask import Flask, render_template, jsonify, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime
from functools import wraps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ON_VERCEL = bool(os.environ.get('VERCEL'))

# Static files live in public/ so Vercel serves them from its CDN.
# Flask also serves them from the same place for local development.
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'public', 'static'),
    static_url_path='/static',
)


def get_database_uri():
    url = os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL')
    if url:
        url = url.strip().strip('"').strip("'")
        # Neon's "Connect" box can copy a whole `psql '...'` command
        if url.startswith('psql '):
            url = url[5:].strip().strip('"').strip("'")
        # Force the psycopg2 driver (the one in requirements.txt), whatever
        # scheme the provider gave: postgres://, postgresql://, postgresql+psycopg://
        for prefix in ('postgresql+psycopg2://', 'postgresql+psycopg://',
                       'postgresql://', 'postgres://'):
            if url.startswith(prefix):
                url = 'postgresql+psycopg2://' + url[len(prefix):]
                break
        return url
    # Fallback so the app still boots. On Vercel the filesystem is read-only
    # except /tmp, and /tmp is wiped between invocations - set DATABASE_URL!
    if ON_VERCEL:
        return 'sqlite:////tmp/users.db'
    return 'sqlite:///' + os.path.join(BASE_DIR, 'instance', 'users.db')


app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-only-insecure-key')
app.config['SQLALCHEMY_DATABASE_URI'] = get_database_uri()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True, 'pool_recycle': 280,
                                              'connect_args': {'connect_timeout': 5} if os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL') else {}}
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = ON_VERCEL

if not ON_VERCEL:
    os.makedirs(os.path.join(BASE_DIR, 'instance'), exist_ok=True)

db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    preferences = db.Column(db.Text) 

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    atco_code = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(200))
    street = db.Column(db.String(200))
    locality = db.Column(db.String(200))
    authority = db.Column(db.String(100))
    lines = db.Column(db.String(500))
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    

    user = db.relationship('User', backref=db.backref('favorites', lazy=True))
    

    __table_args__ = (
        db.UniqueConstraint('user_id', 'atco_code', name='unique_user_favorite'),
    )


_tables_ready = False


def ensure_tables():
    global _tables_ready
    if _tables_ready:
        return
    db.create_all()
    _tables_ready = True


try:
    with app.app_context():
        ensure_tables()
except Exception as e:  # DB unreachable at cold start; retry on first request
    print(f"Could not create tables at startup: {e}")


@app.before_request
def _make_sure_tables_exist():
    # Pages that never touch the database must not wait on it
    if request.endpoint in ('static', 'home', 'explorer', 'about', 'help_center', 'get_bus_stops'):
        return
    if not _tables_ready:
        try:
            ensure_tables()
        except Exception as e:
            print(f"Database error: {e}")


def generate_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = os.urandom(24).hex()
    return session['csrf_token']

app.jinja_env.globals['csrf_token'] = generate_csrf_token


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page.', 'error')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def csrf_protected(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'POST':
            csrf_token = request.headers.get('X-CSRFToken') or request.form.get('csrf_token')
            if not csrf_token or csrf_token != session.get('csrf_token'):
                return jsonify({'success': False, 'error': 'CSRF token missing or invalid'}), 400
        return f(*args, **kwargs)
    return decorated_function


def get_current_user_id():
    return session.get('user_id')


@app.route('/')
def home():
    return render_template('index.html')

@app.route('/explorer')
def explorer():
    lat = request.args.get('lat')
    lng = request.args.get('lng')
    return render_template('explorer.html', lat=lat, lng=lng)

@app.route('/toggle_favorite', methods=['POST'])
@login_required
@csrf_protected
def toggle_favorite():
    try:
        if not get_current_user_id():
            return jsonify({'success': False, 'error': 'not_logged_in'}), 401
        data = request.get_json()
        
        atco_code = data.get('atco')
        user_id = get_current_user_id()
        
        if not atco_code:
            return jsonify({'success': False, 'error': 'No ATCO code provided'})
        
     
        favorite = Favorite.query.filter_by(
            user_id=user_id,
            atco_code=atco_code
        ).first()
        
        if favorite:
  
            db.session.delete(favorite)
            db.session.commit()
            return jsonify({
                'success': True, 
                'action': 'removed',
                'message': 'Removed from favorites'
            })
        else:
      
            new_favorite = Favorite(
                user_id=user_id,
                atco_code=atco_code,
                name=data.get('name'),
                street=data.get('street'),
                locality=data.get('locality'),
                authority=data.get('authority'),
                lines=data.get('lines'),
                lat=data.get('lat'),
                lng=data.get('lng'),
                added_at=datetime.utcnow()
            )
            db.session.add(new_favorite)
            db.session.commit()
            return jsonify({
                'success': True,
                'action': 'added',
                'message': 'Added to favorites'
            })
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/remove_favorite', methods=['POST'])
@login_required
@csrf_protected
def remove_favorite():
    try:
        data = request.get_json()
        atco_code = data.get('atco_code')
        user_id = get_current_user_id()
        
        favorite = Favorite.query.filter_by(
            user_id=user_id,
            atco_code=atco_code
        ).first()
        
        if favorite:
            db.session.delete(favorite)
            db.session.commit()
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Favorite not found'})
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/clear_all_favorites', methods=['POST'])
@login_required
@csrf_protected
def clear_all_favorites():
    try:
        user_id = get_current_user_id()
        Favorite.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/get_favorites_count')
@login_required
def get_favorites_count():
    user_id = get_current_user_id()
    count = Favorite.query.filter_by(user_id=user_id).count()
    return jsonify({'count': count})

@app.route('/check_favorite/<atco_code>')
@login_required
def check_favorite(atco_code):
    user_id = get_current_user_id()
    favorite = Favorite.query.filter_by(
        user_id=user_id,
        atco_code=atco_code
    ).first()
    
    return jsonify({'is_favorite': favorite is not None})

@app.route('/favorites')
@login_required
def favorites():
    user_id = get_current_user_id()
    
    user_favorites = Favorite.query.filter_by(
        user_id=user_id
    ).order_by(Favorite.added_at.desc()).all()
    
    

    
    return render_template('favorites.html', favorites=user_favorites)

@app.route('/api/user_favorites')
@login_required
def get_user_favorites():
    """Get all favorite stops for the current user"""
    user_id = get_current_user_id()
    
    favorites = Favorite.query.filter_by(user_id=user_id).all()
    
 
    features = []
    for fav in favorites:
        if fav.lat is not None and fav.lng is not None:
            feature = {
                "type": "Feature",
                "properties": {
                    "atco": fav.atco_code,
                    "name": fav.name,
                    "street": fav.street,
                    "locality": fav.locality,
                    "authority": fav.authority,
                    "lines": fav.lines,
                    "is_favorite": True
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [fav.lng, fav.lat]
                }
            }
            features.append(feature)
    
    return jsonify({
        "type": "FeatureCollection",
        "features": features
    })

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/profile')
@login_required
def profile():
    user = db.session.get(User, session['user_id'])
    return render_template('profile.html', user=user)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            session['user_id'] = user.id
            session['username'] = user.username
      
            session['csrf_token'] = os.urandom(24).hex()
            flash('Login successful!', 'success')
            return redirect(url_for('home'))
        else:
            flash('Invalid username or password.', 'error')
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            flash('Passwords do not match.', 'error')
            return render_template('register.html')
        
        if User.query.filter_by(username=username).first():
            flash('Username already exists.', 'error')
            return render_template('register.html')
        
        if User.query.filter_by(email=email).first():
            flash('Email already exists.', 'error')
            return render_template('register.html')
        
        user = User(username=username, email=email)
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        flash('Registration successful! Please log in.', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/update_profile', methods=['POST'])
@login_required
@csrf_protected
def update_profile():
    user = db.session.get(User, session['user_id'])

    user.first_name = request.form.get('first_name')
    user.last_name = request.form.get('last_name')
    user.email = request.form.get('email')

 
    new_password = request.form.get('new_password')
    if new_password and new_password.strip() != "":
        user.set_password(new_password)

    db.session.commit()
    flash('Profile updated successfully!', 'success')
    return redirect(url_for('profile'))


@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('home'))

@app.route('/api/busstops')
def get_bus_stops():
    # 2.6 MB file: let the static CDN serve it rather than the serverless function
    return redirect(url_for('static', filename='data/Bus_Stops.geojson'), code=302)

@app.route('/help-center')
def help_center():
    return render_template('help_center.html')

@app.route('/feedback', methods=['GET', 'POST'])
def feedback():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        subject = request.form.get('subject')
        message = request.form.get('message')
        rating = request.form.get('rating')
        
        print(f"Feedback received from {name} ({email}): {subject} - Rating: {rating}")
        print(f"Message: {message}")
        
        flash('Thank you for your feedback! We appreciate your input.', 'success')
        return redirect(url_for('feedback'))
    
    return render_template('feedback.html')

@app.route('/submit-feedback', methods=['POST'])
@csrf_protected
def submit_feedback():
    data = request.get_json()
    return jsonify({'status': 'success', 'message': 'Feedback submitted successfully'})

@app.context_processor
def inject_user():
    return dict(session=session)


@app.context_processor
def inject_template_vars():
    return {
        'logged_in': 'user_id' in session,
        'current_user_id': session.get('user_id'),
        'current_username': session.get('username')
    }

if __name__ == '__main__':
    app.run(debug=os.environ.get('FLASK_DEBUG') == '1')