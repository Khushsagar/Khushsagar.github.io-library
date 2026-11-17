import os
import secrets
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
from database import (
    init_db, verify_admin, change_admin_password,
    get_all_students, get_student_by_id, add_student, update_student, delete_student,
    get_all_books, get_book_by_id, add_book, update_book, delete_book,
    issue_book, return_book, extend_loan, get_loans, get_dashboard_stats
)

app = Flask(__name__)
# Generate or persist a secret key for session security
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Initialize database on app start
init_db()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({"success": False, "error": "Unauthorized. Please log in as Librarian."}), 401
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated_function

# ----------------- AUTHENTICATION ROUTES -----------------

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'admin_id' in session:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        admin = verify_admin(username, password)
        if admin:
            session['admin_id'] = admin['id']
            session['admin_username'] = admin['username']
            session['admin_name'] = admin['name']
            session['admin_email'] = admin['email']
            flash(f"Welcome back, {admin['name']}!", "success")
            next_url = request.args.get('next')
            return redirect(next_url or url_for('dashboard'))
        else:
            flash("Invalid Librarian username or password. Please try again.", "danger")

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash("You have been securely logged out.", "info")
    return redirect(url_for('login'))

@app.route('/api/admin/change-password', methods=['POST'])
@login_required
def api_change_password():
    data = request.get_json() or {}
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not old_password or not new_password:
        return jsonify({"success": False, "error": "Current and new password are required."}), 400

    if len(new_password) < 6:
        return jsonify({"success": False, "error": "New password must be at least 6 characters."}), 400

    success, msg = change_admin_password(session['admin_id'], old_password, new_password)
    if success:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "error": msg}), 400

# ----------------- DASHBOARD VIEW -----------------

@app.route('/')
@login_required
def dashboard():
    initial_tab = request.args.get('tab', 'overview')
    return render_template('dashboard.html', 
                           admin_name=session.get('admin_name', 'Librarian'),
                           admin_username=session.get('admin_username', 'admin'),
                           admin_email=session.get('admin_email', 'librarian@college.edu'),
                           initial_tab=initial_tab)

# ----------------- OVERVIEW API -----------------

@app.route('/api/overview')
@login_required
def api_overview():
    try:
        stats = get_dashboard_stats()
        return jsonify({"success": True, "data": stats})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ----------------- STUDENT MANAGEMENT APIS -----------------

@app.route('/api/students', methods=['GET'])
@login_required
def api_students():
    query = request.args.get('q', None)
    students = get_all_students(search_query=query)
    return jsonify({"success": True, "students": students})

@app.route('/api/students/<int:student_id>', methods=['GET'])
@login_required
def api_student_detail(student_id):
    student = get_student_by_id(student_id)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404
    return jsonify({"success": True, "student": student})

@app.route('/api/students', methods=['POST'])
@login_required
def api_add_student():
    data = request.get_json() or {}
    name = data.get('name')
    roll_number = data.get('roll_number')
    email = data.get('email')
    phone = data.get('phone') # optional
    department = data.get('department', 'General')
    semester = data.get('semester', '1st Sem')

    success, res = add_student(name, roll_number, email, phone, department, semester)
    if success:
        return jsonify({"success": True, "result": res}), 201
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/students/<int:student_id>', methods=['PUT'])
@login_required
def api_update_student(student_id):
    data = request.get_json() or {}
    name = data.get('name')
    roll_number = data.get('roll_number')
    email = data.get('email')
    phone = data.get('phone') # optional
    department = data.get('department', 'General')
    semester = data.get('semester', '1st Sem')

    success, res = update_student(student_id, name, roll_number, email, phone, department, semester)
    if success:
        return jsonify({"success": True, "message": res})
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
@login_required
def api_delete_student(student_id):
    success, res = delete_student(student_id)
    if success:
        return jsonify({"success": True, "message": res})
    return jsonify({"success": False, "error": res}), 400

# ----------------- CATALOG MANAGEMENT APIS -----------------

@app.route('/api/books', methods=['GET'])
@login_required
def api_books():
    query = request.args.get('q', None)
    category = request.args.get('category', None)
    books = get_all_books(search_query=query, category=category)
    return jsonify({"success": True, "books": books})

@app.route('/api/books/<int:book_id>', methods=['GET'])
@login_required
def api_book_detail(book_id):
    book = get_book_by_id(book_id)
    if not book:
        return jsonify({"success": False, "error": "Book not found"}), 404
    return jsonify({"success": True, "book": book})

@app.route('/api/books', methods=['POST'])
@login_required
def api_add_book():
    data = request.get_json() or {}
    title = data.get('title')
    author = data.get('author')
    isbn = data.get('isbn')
    category = data.get('category', 'General')
    total_copies = data.get('total_copies', 1)
    shelf_location = data.get('shelf_location', 'General Section')
    published_year = data.get('published_year')
    description = data.get('description', '')

    success, res = add_book(title, author, isbn, category, total_copies, shelf_location, published_year, description)
    if success:
        return jsonify({"success": True, "result": res}), 201
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/books/<int:book_id>', methods=['PUT'])
@login_required
def api_update_book(book_id):
    data = request.get_json() or {}
    title = data.get('title')
    author = data.get('author')
    isbn = data.get('isbn')
    category = data.get('category', 'General')
    total_copies = data.get('total_copies', 1)
    shelf_location = data.get('shelf_location', 'General Section')
    published_year = data.get('published_year')
    description = data.get('description', '')

    success, res = update_book(book_id, title, author, isbn, category, total_copies, shelf_location, published_year, description)
    if success:
        return jsonify({"success": True, "message": res})
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/books/<int:book_id>', methods=['DELETE'])
@login_required
def api_delete_book(book_id):
    success, res = delete_book(book_id)
    if success:
        return jsonify({"success": True, "message": res})
    return jsonify({"success": False, "error": res}), 400

# ----------------- LOAN AND RETURN APIS -----------------

@app.route('/api/loans', methods=['GET'])
@login_required
def api_loans():
    status = request.args.get('status', 'ALL')
    query = request.args.get('q', '')
    loans = get_loans(filter_status=status, search=query)
    return jsonify({"success": True, "loans": loans})

@app.route('/api/loans/issue', methods=['POST'])
@login_required
def api_issue_book():
    data = request.get_json() or {}
    student_id = data.get('student_id')
    book_id = data.get('book_id')
    due_date = data.get('due_date')
    notes = data.get('notes', '')

    if not student_id or not book_id:
        return jsonify({"success": False, "error": "Please select both a student and a book."}), 400

    success, res = issue_book(student_id, book_id, due_date_str=due_date, notes=notes)
    if success:
        return jsonify({"success": True, "result": res}), 201
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/loans/<int:loan_id>/return', methods=['POST'])
@login_required
def api_return_book(loan_id):
    data = request.get_json() or {}
    fine_waived = data.get('fine_waived', False)
    notes = data.get('notes', '')

    success, res = return_book(loan_id, fine_waived=fine_waived, notes=notes)
    if success:
        return jsonify({"success": True, "result": res})
    return jsonify({"success": False, "error": res}), 400

@app.route('/api/loans/<int:loan_id>/extend', methods=['POST'])
@login_required
def api_extend_loan(loan_id):
    data = request.get_json() or {}
    extra_days = data.get('extra_days', 14)
    success, res = extend_loan(loan_id, extra_days=extra_days)
    if success:
        return jsonify({"success": True, "message": res})
    return jsonify({"success": False, "error": res}), 400

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting College Library Management System on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
