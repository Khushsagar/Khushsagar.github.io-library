"""
Database initialization, schema, and helper functions for College Library Management System.
Implements data integrity, parameterization against SQL injection, and foreign key constraints.
"""

import sqlite3
import os
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "library.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Initializes tables and default admin if not already present."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Admins Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Students Table (name, roll_number unique, email, phone optional)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        department TEXT DEFAULT 'General',
        semester TEXT DEFAULT '1st Sem',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Catalog / Books Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT NOT NULL,
        total_copies INTEGER NOT NULL DEFAULT 1,
        available_copies INTEGER NOT NULL DEFAULT 1,
        shelf_location TEXT DEFAULT 'General Section',
        published_year INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 4. Loans Table (Circulation / Loan & Return)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        return_date DATE,
        status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE or RETURNED
        fine_amount REAL DEFAULT 0.0,
        fine_paid INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT
    )
    """)

    # Check if default librarian admin exists
    cursor.execute("SELECT id FROM admins WHERE username = 'admin'")
    if not cursor.fetchone():
        default_pwd_hash = generate_password_hash("admin123")
        cursor.execute("""
        INSERT INTO admins (username, password_hash, name, email)
        VALUES (?, ?, ?, ?)
        """, ("admin", default_pwd_hash, "Head Librarian", "librarian@college.edu"))
        print("[DB] Default librarian admin created (username: admin, password: admin123)")

    conn.commit()
    conn.close()

# ----------------- SECURITY & ADMIN HELPERS -----------------

def verify_admin(username, password):
    conn = get_db()
    admin = conn.execute("SELECT * FROM admins WHERE username = ?", (username,)).fetchone()
    conn.close()
    if admin and check_password_hash(admin['password_hash'], password):
        return dict(admin)
    return None

def change_admin_password(admin_id, old_password, new_password):
    conn = get_db()
    admin = conn.execute("SELECT * FROM admins WHERE id = ?", (admin_id,)).fetchone()
    if not admin:
        conn.close()
        return False, "Admin account not found"
    
    if not check_password_hash(admin['password_hash'], old_password):
        conn.close()
        return False, "Incorrect current password"
    
    new_hash = generate_password_hash(new_password)
    conn.execute("UPDATE admins SET password_hash = ? WHERE id = ?", (new_hash, admin_id))
    conn.commit()
    conn.close()
    return True, "Password updated successfully"

# ----------------- STUDENT MANAGEMENT HELPERS -----------------

def get_all_students(search_query=None):
    conn = get_db()
    if search_query:
        param = f"%{search_query.strip()}%"
        query = """
        SELECT s.*, 
            (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.status = 'ACTIVE') AS active_loans_count
        FROM students s
        WHERE s.name LIKE ? OR s.roll_number LIKE ? OR s.email LIKE ? OR s.department LIKE ?
        ORDER BY s.roll_number ASC
        """
        students = conn.execute(query, (param, param, param, param)).fetchall()
    else:
        query = """
        SELECT s.*, 
            (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.status = 'ACTIVE') AS active_loans_count
        FROM students s
        ORDER BY s.roll_number ASC
        """
        students = conn.execute(query).fetchall()
    conn.close()
    return [dict(s) for s in students]

def get_student_by_id(student_id):
    conn = get_db()
    student = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return None
    res = dict(student)
    loans = conn.execute("""
        SELECT l.*, b.title as book_title, b.isbn as book_isbn
        FROM loans l
        JOIN books b ON l.book_id = b.id
        WHERE l.student_id = ?
        ORDER BY l.created_at DESC
    """, (student_id,)).fetchall()
    conn.close()
    res['loans'] = [dict(l) for l in loans]
    return res

def add_student(name, roll_number, email, phone=None, department="General", semester="1st Sem"):
    name = (name or "").strip()
    roll_number = (roll_number or "").strip().upper()
    email = (email or "").strip().lower()
    phone = (phone or "").strip() or None
    department = (department or "General").strip()
    semester = (semester or "1st Sem").strip()

    if not name or not roll_number or not email:
        return False, "Name, Roll Number, and Email are required fields."

    conn = get_db()
    try:
        # Check uniqueness of roll number
        existing = conn.execute("SELECT id FROM students WHERE roll_number = ?", (roll_number,)).fetchone()
        if existing:
            conn.close()
            return False, f"A student with Roll Number '{roll_number}' already exists."

        cursor = conn.execute("""
        INSERT INTO students (name, roll_number, email, phone, department, semester)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (name, roll_number, email, phone, department, semester))
        student_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return True, {"id": student_id, "message": f"Student {name} ({roll_number}) added successfully."}
    except sqlite3.IntegrityError as e:
        conn.close()
        return False, f"Database error: {str(e)}"

def update_student(student_id, name, roll_number, email, phone=None, department="General", semester="1st Sem"):
    name = (name or "").strip()
    roll_number = (roll_number or "").strip().upper()
    email = (email or "").strip().lower()
    phone = (phone or "").strip() or None

    if not name or not roll_number or not email:
        return False, "Name, Roll Number, and Email are required fields."

    conn = get_db()
    try:
        # Check if roll number taken by another student
        existing = conn.execute("SELECT id FROM students WHERE roll_number = ? AND id != ?", (roll_number, student_id)).fetchone()
        if existing:
            conn.close()
            return False, f"Roll Number '{roll_number}' is already assigned to another student."

        conn.execute("""
        UPDATE students
        SET name = ?, roll_number = ?, email = ?, phone = ?, department = ?, semester = ?
        WHERE id = ?
        """, (name, roll_number, email, phone, department, semester, student_id))
        conn.commit()
        conn.close()
        return True, "Student details updated successfully."
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_student(student_id):
    """
    Security safeguard: Blocks deletion if student has unreturned/active book loans.
    """
    conn = get_db()
    # Check for active loans
    active_loans = conn.execute("""
        SELECT l.id, b.title 
        FROM loans l 
        JOIN books b ON l.book_id = b.id 
        WHERE l.student_id = ? AND l.status = 'ACTIVE'
    """, (student_id,)).fetchall()

    if active_loans:
        titles = ", ".join([f"'{item['title']}'" for item in active_loans])
        conn.close()
        return False, f"Security Rule: Cannot delete student. They currently have {len(active_loans)} unreturned book(s): {titles}. Please have the books returned first."

    # Delete past returned loan history or delete student
    try:
        # Delete completed past loans history for clean removal
        conn.execute("DELETE FROM loans WHERE student_id = ? AND status = 'RETURNED'", (student_id,))
        conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        conn.close()
        return True, "Student deleted successfully."
    except Exception as e:
        conn.close()
        return False, f"Error deleting student: {str(e)}"

# ----------------- CATALOG / BOOK MANAGEMENT HELPERS -----------------

def get_all_books(search_query=None, category=None):
    conn = get_db()
    params = []
    where_clauses = []

    if search_query:
        param = f"%{search_query.strip()}%"
        where_clauses.append("(title LIKE ? OR author LIKE ? OR isbn LIKE ? OR shelf_location LIKE ?)")
        params.extend([param, param, param, param])

    if category and category != 'All':
        where_clauses.append("category = ?")
        params.append(category)

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    query = f"""
    SELECT b.*,
           (b.total_copies - b.available_copies) as loaned_copies
    FROM books b
    {where_sql}
    ORDER BY b.title ASC
    """
    books = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    return [dict(b) for b in books]

def get_book_by_id(book_id):
    conn = get_db()
    book = conn.execute("""
        SELECT b.*, (b.total_copies - b.available_copies) as loaned_copies
        FROM books b WHERE b.id = ?
    """, (book_id,)).fetchone()
    if not book:
        conn.close()
        return None
    res = dict(book)
    active_loans = conn.execute("""
        SELECT l.*, s.name as student_name, s.roll_number as student_roll
        FROM loans l
        JOIN students s ON l.student_id = s.id
        WHERE l.book_id = ? AND l.status = 'ACTIVE'
    """, (book_id,)).fetchall()
    conn.close()
    res['active_loans'] = [dict(l) for l in active_loans]
    return res

def add_book(title, author, isbn, category, total_copies=1, shelf_location="General Section", published_year=None, description=""):
    title = (title or "").strip()
    author = (author or "").strip()
    isbn = (isbn or "").strip().upper()
    category = (category or "General").strip()
    shelf_location = (shelf_location or "General Section").strip()
    
    try:
        total_copies = int(total_copies)
        if total_copies < 1:
            total_copies = 1
    except (ValueError, TypeError):
        total_copies = 1

    try:
        published_year = int(published_year) if published_year else None
    except (ValueError, TypeError):
        published_year = None

    if not title or not author or not isbn:
        return False, "Title, Author, and ISBN / Catalog Code are required."

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM books WHERE isbn = ?", (isbn,)).fetchone()
        if existing:
            conn.close()
            return False, f"A catalog item with ISBN/Code '{isbn}' already exists."

        cursor = conn.execute("""
        INSERT INTO books (isbn, title, author, category, total_copies, available_copies, shelf_location, published_year, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (isbn, title, author, category, total_copies, total_copies, shelf_location, published_year, description))
        book_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return True, {"id": book_id, "message": f"Book '{title}' added to catalog successfully."}
    except Exception as e:
        conn.close()
        return False, f"Database error: {str(e)}"

def update_book(book_id, title, author, isbn, category, total_copies, shelf_location, published_year=None, description=""):
    conn = get_db()
    book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if not book:
        conn.close()
        return False, "Catalog item not found."

    try:
        total_copies = int(total_copies)
        if total_copies < 1:
            return False, "Total copies must be at least 1."
    except Exception:
        return False, "Invalid total copies number."

    # Check that total copies is not less than currently loaned copies
    current_loaned = book['total_copies'] - book['available_copies']
    if total_copies < current_loaned:
        conn.close()
        return False, f"Cannot reduce total copies below {current_loaned} because {current_loaned} copies are currently on loan."

    new_available = total_copies - current_loaned

    try:
        # Check ISBN uniqueness
        existing = conn.execute("SELECT id FROM books WHERE isbn = ? AND id != ?", (isbn, book_id)).fetchone()
        if existing:
            conn.close()
            return False, f"ISBN '{isbn}' is already in use by another catalog entry."

        conn.execute("""
        UPDATE books
        SET title = ?, author = ?, isbn = ?, category = ?, total_copies = ?, available_copies = ?, shelf_location = ?, published_year = ?, description = ?
        WHERE id = ?
        """, (title, author, isbn, category, total_copies, new_available, shelf_location, published_year, description, book_id))
        conn.commit()
        conn.close()
        return True, "Catalog item updated successfully."
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_book(book_id):
    """
    Security safeguard: Blocks deletion if any copy of this book is currently checked out.
    """
    conn = get_db()
    active_loans = conn.execute("SELECT COUNT(*) as cnt FROM loans WHERE book_id = ? AND status = 'ACTIVE'", (book_id,)).fetchone()['cnt']
    if active_loans > 0:
        conn.close()
        return False, f"Security Rule: Cannot delete this book. {active_loans} copy/copies are currently loaned to students. Receive returns before deleting."

    try:
        # Clear past returned loans reference or delete
        conn.execute("DELETE FROM loans WHERE book_id = ? AND status = 'RETURNED'", (book_id,))
        conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
        conn.close()
        return True, "Catalog item removed successfully."
    except Exception as e:
        conn.close()
        return False, str(e)

# ----------------- LOAN AND RETURN HELPERS -----------------

FINE_PER_DAY = 5.0 # default 5 currency units per overdue day

def issue_book(student_id, book_id, due_date_str=None, notes=""):
    conn = get_db()
    
    # 1. Verify student exists
    student = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return False, "Student not found."

    # 2. Verify book exists and has available copies
    book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if not book:
        conn.close()
        return False, "Book not found."

    if book['available_copies'] <= 0:
        conn.close()
        return False, f"Cannot issue: '{book['title']}' has no available copies left in stock."

    # 3. Check if student already has this exact book on active loan
    already_loaned = conn.execute("""
        SELECT id FROM loans WHERE student_id = ? AND book_id = ? AND status = 'ACTIVE'
    """, (student_id, book_id)).fetchone()
    if already_loaned:
        conn.close()
        return False, f"Student {student['name']} already currently has a copy of '{book['title']}' on loan."

    # 4. Dates
    today = date.today()
    if due_date_str:
        try:
            due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date()
        except ValueError:
            due_date = today + datetime.resolution * 14
    else:
        # Default 14 days loan period
        from datetime import timedelta
        due_date = today + timedelta(days=14)

    if due_date < today:
        conn.close()
        return False, "Due date cannot be before today's date."

    try:
        # Create loan record
        cursor = conn.execute("""
        INSERT INTO loans (student_id, book_id, issue_date, due_date, status, notes)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?)
        """, (student_id, book_id, today.isoformat(), due_date.isoformat(), notes))
        
        # Decrement available copies
        conn.execute("""
        UPDATE books SET available_copies = available_copies - 1 WHERE id = ?
        """, (book_id,))

        conn.commit()
        loan_id = cursor.lastrowid
        conn.close()
        return True, {"loan_id": loan_id, "message": f"Book '{book['title']}' issued to {student['name']} (Due: {due_date.isoformat()})."}
    except Exception as e:
        conn.close()
        return False, f"Failed to issue book: {str(e)}"

def return_book(loan_id, fine_waived=False, notes=""):
    conn = get_db()
    loan = conn.execute("""
        SELECT l.*, b.title as book_title, s.name as student_name
        FROM loans l
        JOIN books b ON l.book_id = b.id
        JOIN students s ON l.student_id = s.id
        WHERE l.id = ?
    """, (loan_id,)).fetchone()

    if not loan:
        conn.close()
        return False, "Loan record not found."

    if loan['status'] == 'RETURNED':
        conn.close()
        return False, "This book has already been returned."

    today = date.today()
    due_date = datetime.strptime(loan['due_date'], "%Y-%m-%d").date()
    
    # Calculate overdue days & fine
    overdue_days = (today - due_date).days
    fine = 0.0
    if overdue_days > 0 and not fine_waived:
        fine = overdue_days * FINE_PER_DAY

    try:
        # Update loan record
        combined_notes = (loan['notes'] or "")
        if notes:
            combined_notes += f" | Return note: {notes}"
        if overdue_days > 0:
            combined_notes += f" | Returned {overdue_days} days late"

        conn.execute("""
        UPDATE loans
        SET status = 'RETURNED', return_date = ?, fine_amount = ?, fine_paid = 1, notes = ?
        WHERE id = ?
        """, (today.isoformat(), fine, combined_notes.strip(), loan_id))

        # Increment available copies
        conn.execute("""
        UPDATE books SET available_copies = available_copies + 1 WHERE id = ?
        """, (loan['book_id'],))

        conn.commit()
        conn.close()
        return True, {
            "message": f"Book '{loan['book_title']}' returned successfully.",
            "overdue_days": max(0, overdue_days),
            "fine_amount": fine
        }
    except Exception as e:
        conn.close()
        return False, f"Error returning book: {str(e)}"

def extend_loan(loan_id, extra_days=14):
    conn = get_db()
    loan = conn.execute("SELECT * FROM loans WHERE id = ? AND status = 'ACTIVE'", (loan_id,)).fetchone()
    if not loan:
        conn.close()
        return False, "Active loan not found."

    from datetime import timedelta
    current_due = datetime.strptime(loan['due_date'], "%Y-%m-%d").date()
    new_due = current_due + timedelta(days=extra_days)

    conn.execute("UPDATE loans SET due_date = ? WHERE id = ?", (new_due.isoformat(), loan_id))
    conn.commit()
    conn.close()
    return True, f"Due date extended to {new_due.isoformat()}"

def get_loans(filter_status="ALL", search=""):
    conn = get_db()
    today_str = date.today().isoformat()
    
    query = """
    SELECT l.*, 
           s.name as student_name, s.roll_number as student_roll, s.email as student_email, s.phone as student_phone,
           b.title as book_title, b.isbn as book_isbn, b.category as book_category,
           CASE 
               WHEN l.status = 'ACTIVE' AND l.due_date < ? THEN 1
               ELSE 0
           END as is_overdue,
           CASE
               WHEN l.status = 'ACTIVE' AND l.due_date < ? THEN (julianday(?) - julianday(l.due_date))
               ELSE 0
           END as overdue_days
    FROM loans l
    JOIN students s ON l.student_id = s.id
    JOIN books b ON l.book_id = b.id
    """
    
    where_parts = []
    params = [today_str, today_str, today_str]

    if filter_status == "ACTIVE":
        where_parts.append("l.status = 'ACTIVE'")
    elif filter_status == "OVERDUE":
        where_parts.append("l.status = 'ACTIVE' AND l.due_date < ?")
        params.append(today_str)
    elif filter_status == "RETURNED":
        where_parts.append("l.status = 'RETURNED'")

    if search:
        search_param = f"%{search.strip()}%"
        where_parts.append("(s.name LIKE ? OR s.roll_number LIKE ? OR b.title LIKE ? OR b.isbn LIKE ?)")
        params.extend([search_param, search_param, search_param, search_param])

    if where_parts:
        query += " WHERE " + " AND ".join(where_parts)

    query += " ORDER BY CASE WHEN l.status = 'ACTIVE' AND l.due_date < ? THEN 0 ELSE 1 END, l.created_at DESC"
    params.append(today_str)

    loans = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    res = []
    for l in loans:
        d = dict(l)
        d['overdue_days'] = max(0, int(d.get('overdue_days') or 0))
        d['estimated_fine'] = d['overdue_days'] * FINE_PER_DAY if d['is_overdue'] else 0.0
        res.append(d)
    return res

# ----------------- OVERVIEW / DASHBOARD ANALYTICS -----------------

def get_dashboard_stats():
    conn = get_db()
    today_str = date.today().isoformat()

    total_books = conn.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(total_copies), 0) as copies, COALESCE(SUM(available_copies), 0) as avail FROM books").fetchone()
    total_students = conn.execute("SELECT COUNT(*) as cnt FROM students").fetchone()['cnt']
    
    active_loans = conn.execute("SELECT COUNT(*) as cnt FROM loans WHERE status = 'ACTIVE'").fetchone()['cnt']
    overdue_loans = conn.execute("SELECT COUNT(*) as cnt FROM loans WHERE status = 'ACTIVE' AND due_date < ?", (today_str,)).fetchone()['cnt']
    returned_loans = conn.execute("SELECT COUNT(*) as cnt FROM loans WHERE status = 'RETURNED'").fetchone()['cnt']

    # Category breakdown for charts
    categories = conn.execute("""
        SELECT category, COUNT(*) as book_count, SUM(total_copies) as total_copies
        FROM books
        GROUP BY category
        ORDER BY total_copies DESC
        LIMIT 6
    """).fetchall()

    # Books due soon (within next 3 days) or overdue
    from datetime import timedelta
    soon_str = (date.today() + timedelta(days=3)).isoformat()
    due_alerts = conn.execute("""
        SELECT l.*, s.name as student_name, s.roll_number as student_roll, s.email as student_email, s.phone as student_phone,
               b.title as book_title,
               (julianday(l.due_date) - julianday(?)) as days_remaining
        FROM loans l
        JOIN students s ON l.student_id = s.id
        JOIN books b ON l.book_id = b.id
        WHERE l.status = 'ACTIVE' AND l.due_date <= ?
        ORDER BY l.due_date ASC
        LIMIT 5
    """, (today_str, soon_str)).fetchall()

    # Recent activity stream
    recent_loans = conn.execute("""
        SELECT l.*, s.name as student_name, s.roll_number as student_roll, b.title as book_title
        FROM loans l
        JOIN students s ON l.student_id = s.id
        JOIN books b ON l.book_id = b.id
        ORDER BY l.id DESC
        LIMIT 6
    """).fetchall()

    conn.close()

    return {
        "total_titles": total_books['cnt'],
        "total_book_copies": total_books['copies'],
        "available_book_copies": total_books['avail'],
        "issued_book_copies": total_books['copies'] - total_books['avail'],
        "total_students": total_students,
        "active_loans": active_loans,
        "overdue_loans": overdue_loans,
        "returned_loans": returned_loans,
        "categories": [dict(c) for c in categories],
        "due_alerts": [dict(a) for a in due_alerts],
        "recent_loans": [dict(r) for r in recent_loans]
    }

