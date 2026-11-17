"""
Seeds realistic college library records (Students, Catalog Books, Active & Overdue Loans)
"""

from database import init_db, add_student, add_book, issue_book, get_db
from datetime import date, timedelta

def seed():
    init_db()
    conn = get_db()
    
    # Check if already seeded
    student_count = conn.execute("SELECT COUNT(*) as cnt FROM students").fetchone()['cnt']
    if student_count > 0:
        print("[SEED] Database already contains records. Skipping seed.")
        conn.close()
        return

    conn.close()
    print("[SEED] Seeding college library sample data...")

    # 1. Add Sample Students
    students_data = [
        ("Aarav Sharma", "CS2023-014", "aarav.sharma@college.edu", "9876543210", "Computer Science", "3rd Year"),
        ("Ananya Patel", "IT2024-022", "ananya.patel@college.edu", "9811223344", "Information Tech", "2nd Year"),
        ("Rohan Verma", "ME2022-005", "rohan.verma@college.edu", None, "Mechanical Eng", "4th Year"), # phone optional
        ("Sneha Iyer", "EC2023-031", "sneha.iyer@college.edu", "9765432109", "Electronics & Comm", "3rd Year"),
        ("Vikram Singh", "CS2024-008", "vikram.singh@college.edu", "9988776655", "Computer Science", "1st Year"),
        ("Priya Nair", "BT2023-019", "priya.nair@college.edu", None, "Biotechnology", "2nd Year"), # phone optional
        ("Arjun Reddy", "EE2022-040", "arjun.reddy@college.edu", "9123456780", "Electrical Eng", "4th Year"),
        ("Diya Mehta", "DS2024-012", "diya.mehta@college.edu", "9456123789", "Data Science", "1st Year")
    ]

    student_ids = []
    for s in students_data:
        success, res = add_student(s[0], s[1], s[2], s[3], s[4], s[5])
        if success:
            student_ids.append(res['id'])

    # 2. Add Sample Catalog Books
    books_data = [
        ("Introduction to Algorithms (CLRS)", "Thomas H. Cormen, Charles E. Leiserson", "978-0262033848", "Computer Science", 6, "Rack CS-01", 2009, "Comprehensive textbook covering fundamentals and advanced algorithm design."),
        ("Clean Code: A Handbook of Agile Software Craftsmanship", "Robert C. Martin", "978-0132350884", "Software Eng", 4, "Rack CS-03", 2008, "Classic guide on software engineering craft, readability, and testability."),
        ("Artificial Intelligence: A Modern Approach", "Stuart Russell, Peter Norvig", "978-0134610993", "Artificial Intelligence", 5, "Rack AI-02", 2020, "Leading global textbook on modern AI, agent architectures, and machine learning."),
        ("Database System Concepts", "Abraham Silberschatz, Henry F. Korth", "978-0078022159", "Database Systems", 5, "Rack DB-01", 2019, "Comprehensive text on relational databases, SQL, indexing, and transaction management."),
        ("Computer Networks: A Systems Approach", "Larry L. Peterson, Bruce S. Davie", "978-0123850591", "Networking", 3, "Rack NW-04", 2011, "Principles of computer networks, Internet protocols, socket programming, and routing."),
        ("Digital Design and Computer Architecture", "David Harris, Sarah Harris", "978-0123944245", "Computer Architecture", 4, "Rack EE-02", 2012, "Bridging the gap between digital logic gates and ARM/MIPS computer architectures."),
        ("Higher Engineering Mathematics", "B.S. Grewal", "978-8174091955", "Mathematics", 8, "Rack MATH-01", 2021, "Essential mathematical methods for engineering and science undergraduates."),
        ("Principles of Physics", "David Halliday, Robert Resnick, Jearl Walker", "978-1118230749", "Physics", 4, "Rack PHY-05", 2014, "Standard university physics reference covering mechanics, thermodynamics, and optics."),
        ("Operating System Concepts", "Abraham Silberschatz, Peter B. Galvin", "978-1118063330", "Operating Systems", 5, "Rack CS-02", 2018, "Core coverage of processes, threads, virtual memory, concurrency, and file systems.")
    ]

    book_ids = []
    for b in books_data:
        success, res = add_book(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7])
        if success:
            book_ids.append(res['id'])

    # 3. Create a couple of active loans & 1 overdue loan to show overdue alert features
    today = date.today()
    past_due_date = (today - timedelta(days=5)).isoformat() # 5 days overdue
    future_due_date = (today + timedelta(days=9)).isoformat()
    future_due_date_2 = (today + timedelta(days=12)).isoformat()

    # Loan 1: Overdue loan (Aarav Sharma has Introduction to Algorithms)
    if len(student_ids) >= 1 and len(book_ids) >= 1:
        issue_book(student_ids[0], book_ids[0], due_date_str=past_due_date, notes="Semester reference borrow")
    
    # Loan 2: Active normal loan (Ananya Patel has Clean Code)
    if len(student_ids) >= 2 and len(book_ids) >= 2:
        issue_book(student_ids[1], book_ids[1], due_date_str=future_due_date, notes="Project research")

    # Loan 3: Active normal loan (Sneha Iyer has Artificial Intelligence)
    if len(student_ids) >= 4 and len(book_ids) >= 3:
        issue_book(student_ids[3], book_ids[2], due_date_str=future_due_date_2, notes="Self study assignment")

    print("[SEED] Successfully seeded college library records!")

if __name__ == "__main__":
    seed()

