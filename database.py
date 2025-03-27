import sqlite3

def init_db():
    conn = sqlite3.connect("adolf.db")
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, data TEXT)")
    conn.commit()
    conn.close()

def save_user_data(user_id, data):
    conn = sqlite3.connect("adolf.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO users (user_id, data) VALUES (?, ?)", (user_id, str(data)))
    conn.commit()
    conn.close()

def get_user_data(user_id):
    conn = sqlite3.connect("adolf.db")
    c = conn.cursor()
    c.execute("SELECT data FROM users WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    return eval(result[0]) if result else None

init_db()