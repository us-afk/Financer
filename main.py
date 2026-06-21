from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from pathlib import Path
import os
import httpx
from typing import Optional, List
import uvicorn
import jwt
import bcrypt
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()  # loads .env if present

# Initialize FastAPI app
app = FastAPI(title="Finance Tracker API", version="1.0.0")

# Base directory (safe file serving)
BASE_DIR = Path(__file__).resolve().parent

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
SECRET_KEY = os.getenv("FT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Groq AI config
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ============ DATABASE CONFIGURATION ============
DATABASE_URL = os.getenv("DATABASE_URL")  # For PostgreSQL
USE_POSTGRES = DATABASE_URL is not None

if USE_POSTGRES:
    # PostgreSQL setup
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    # Fix for Railway/Render - they use postgres:// but psycopg2 needs postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    # Parse DATABASE_URL
    url = urlparse(DATABASE_URL)
    DB_CONFIG = {
        'dbname': url.path[1:],
        'user': url.username,
        'password': url.password,
        'host': url.hostname,
        'port': url.port or 5432
    }
    
    def get_db():
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    
    def init_db():
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Transactions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                description TEXT,
                date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id),
                balance REAL DEFAULT 0,
                monthly_limit REAL DEFAULT 0,
                start_date TEXT,
                end_date TEXT
            )
        ''')
        
        # Monthly divisions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monthly_divisions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                category TEXT NOT NULL,
                amount REAL NOT NULL
            )
        ''')
        
        # Recurring settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS recurring_settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id),
                income_amount REAL,
                monthly_limit REAL,
                start_date TEXT,
                is_active BOOLEAN DEFAULT FALSE,
                rollover_enabled BOOLEAN DEFAULT FALSE
            )
        ''')
        
        conn.commit()
        conn.close()
    
    # Helper function to convert psycopg2 rows to dict
    def row_to_dict(cursor, row):
        if row is None:
            return None
        return dict(zip([desc[0] for desc in cursor.description], row))
    
else:
    # SQLite setup (for local development)
    import sqlite3
    
    # Create data directory for persistent storage
    # Use DATA_DIR env var if set (e.g. Render persistent disk at /var/data)
    # Otherwise fall back to a local ./data folder next to main.py
    _data_dir_env = os.getenv("DATA_DIR")
    DATA_DIR = Path(_data_dir_env) if _data_dir_env else BASE_DIR / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATABASE = str(DATA_DIR / "finance_tracker.db")
    
    def get_db():
        conn = sqlite3.connect(DATABASE, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_db():
        conn = sqlite3.connect(DATABASE, check_same_thread=False)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Transactions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                description TEXT,
                date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE,
                balance REAL DEFAULT 0,
                monthly_limit REAL DEFAULT 0,
                start_date TEXT,
                end_date TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Monthly divisions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monthly_divisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Recurring settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS recurring_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE,
                income_amount REAL,
                monthly_limit REAL,
                start_date TEXT,
                is_active BOOLEAN DEFAULT FALSE,
                rollover_enabled BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def row_to_dict(cursor, row):
        if row is None:
            return None
        return dict(row)

# ============ PYDANTIC MODELS ============
class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TransactionCreate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = ""
    date: str

class TransactionUpdate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = ""
    date: str

class Transaction(BaseModel):
    id: int
    category: str
    amount: float
    description: str
    date: str

class SettingsUpdate(BaseModel):
    balance: Optional[float] = None
    monthly_limit: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class Settings(BaseModel):
    balance: float
    monthly_limit: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class MonthlyDivision(BaseModel):
    category: str
    amount: float

class MonthlyDivisionsList(BaseModel):
    divisions: List[MonthlyDivision]

class RecurringSettings(BaseModel):
    income_amount: float
    monthly_limit: float
    start_date: str
    is_active: bool
    rollover_enabled: bool

class RecurringSettingsUpdate(BaseModel):
    income_amount: Optional[float] = None
    monthly_limit: Optional[float] = None
    start_date: Optional[str] = None
    is_active: Optional[bool] = None
    rollover_enabled: Optional[bool] = None

class ApplyRecurringResponse(BaseModel):
    applied: bool

# ============ UTILITY FUNCTIONS ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Verify user exists in database
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = %s" if USE_POSTGRES else "SELECT id FROM users WHERE id = ?", (int(user_id),))
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return int(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# Initialize database
init_db()

# ============ AUTHENTICATION ENDPOINTS ============
@app.post("/auth/register", response_model=Token)
async def register(user: UserCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Check if username exists
        cursor.execute("SELECT id FROM users WHERE username = %s" if USE_POSTGRES else "SELECT id FROM users WHERE username = ?", (user.username,))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Check if email exists (if email provided)
        if user.email:
            cursor.execute("SELECT id FROM users WHERE email = %s" if USE_POSTGRES else "SELECT id FROM users WHERE email = ?", (user.email,))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(status_code=400, detail="Email already exists")
        
        hashed_password = hash_password(user.password)
        
        if USE_POSTGRES:
            cursor.execute(
                "INSERT INTO users (username, email, hashed_password) VALUES (%s, %s, %s) RETURNING id",
                (user.username, user.email, hashed_password)
            )
            user_id = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (%s, 0, 0)",
                (user_id,)
            )
        else:
            cursor.execute(
                "INSERT INTO users (username, email, hashed_password) VALUES (?, ?, ?)",
                (user.username, user.email, hashed_password)
            )
            user_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (?, 0, 0)",
                (user_id,)
            )
        
        conn.commit()
        conn.close()
        
        access_token = create_access_token(data={"sub": user_id})
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        conn.close()
        raise

@app.post("/auth/login", response_model=Token)
async def login(user: UserLogin):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, hashed_password FROM users WHERE username = %s" if USE_POSTGRES else "SELECT id, hashed_password FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    conn.close()
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if USE_POSTGRES:
        user_id, hashed_password = db_user[0], db_user[1]
    else:
        db_user = dict(db_user)
        user_id = db_user["id"]
        hashed_password = db_user["hashed_password"]
    
    if not verify_password(user.password, hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user_id})
    return {"access_token": access_token, "token_type": "bearer"}

# ============ TRANSACTION ENDPOINTS ============
@app.get("/transactions", response_model=List[Transaction])
async def get_transactions(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE user_id = %s ORDER BY date DESC" if USE_POSTGRES else "SELECT id, category, amount, description, date FROM transactions WHERE user_id = ? ORDER BY date DESC",
        (current_user,)
    )
    transactions = cursor.fetchall()
    conn.close()
    
    if USE_POSTGRES:
        return [row_to_dict(cursor, row) for row in transactions]
    return [dict(row) for row in transactions]

@app.post("/transactions", response_model=Transaction)
async def create_transaction(transaction: TransactionCreate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    if USE_POSTGRES:
        cursor.execute(
            "INSERT INTO transactions (user_id, category, amount, description, date) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (current_user, transaction.category.upper(), transaction.amount, transaction.description, transaction.date)
        )
        transaction_id = cursor.fetchone()[0]
    else:
        cursor.execute(
            "INSERT INTO transactions (user_id, category, amount, description, date) VALUES (?, ?, ?, ?, ?)",
            (current_user, transaction.category.upper(), transaction.amount, transaction.description, transaction.date)
        )
        transaction_id = cursor.lastrowid
    
    conn.commit()
    
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE id = %s" if USE_POSTGRES else "SELECT id, category, amount, description, date FROM transactions WHERE id = ?",
        (transaction_id,)
    )
    new_transaction = cursor.fetchone()
    conn.close()
    
    if USE_POSTGRES:
        return row_to_dict(cursor, new_transaction)
    return dict(new_transaction)

@app.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(
    transaction_id: int, 
    transaction: TransactionUpdate, 
    current_user: int = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM transactions WHERE id = %s AND user_id = %s" if USE_POSTGRES else "SELECT id FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    cursor.execute(
        "UPDATE transactions SET category = %s, amount = %s, description = %s, date = %s WHERE id = %s" if USE_POSTGRES else "UPDATE transactions SET category = ?, amount = ?, description = ?, date = ? WHERE id = ?",
        (transaction.category.upper(), transaction.amount, transaction.description, transaction.date, transaction_id)
    )
    conn.commit()
    
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE id = %s" if USE_POSTGRES else "SELECT id, category, amount, description, date FROM transactions WHERE id = ?",
        (transaction_id,)
    )
    updated_transaction = cursor.fetchone()
    conn.close()
    
    if USE_POSTGRES:
        return row_to_dict(cursor, updated_transaction)
    return dict(updated_transaction)


@app.delete("/transactions/all")
async def delete_all_transactions(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM transactions WHERE user_id = %s" if USE_POSTGRES else "DELETE FROM transactions WHERE user_id = ?",
        (current_user,)
    )
    conn.commit()
    conn.close()
    return {"message": "All transactions deleted"}

@app.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: int, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM transactions WHERE id = %s AND user_id = %s" if USE_POSTGRES else "SELECT id FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    cursor.execute("DELETE FROM transactions WHERE id = %s" if USE_POSTGRES else "DELETE FROM transactions WHERE id = ?", (transaction_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Transaction deleted successfully"}

# ============ SETTINGS ENDPOINTS ============
@app.get("/settings", response_model=Settings)
async def get_settings(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = %s" if USE_POSTGRES else "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = ?",
        (current_user,)
    )
    settings_row = cursor.fetchone()
    conn.close()
    
    if not settings_row:
        return Settings(balance=0, monthly_limit=0)
    
    if USE_POSTGRES:
        return {
            "balance": settings_row[0],
            "monthly_limit": settings_row[1],
            "start_date": settings_row[2],
            "end_date": settings_row[3],
        }
    
    return {
        "balance": settings_row["balance"],
        "monthly_limit": settings_row["monthly_limit"],
        "start_date": settings_row["start_date"],
        "end_date": settings_row["end_date"],
    }

@app.put("/settings", response_model=Settings)
async def update_settings(settings_in: SettingsUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM settings WHERE user_id = %s" if USE_POSTGRES else "SELECT id FROM settings WHERE user_id = ?", (current_user,))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (%s, 0, 0)" if USE_POSTGRES else "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (?, 0, 0)",
            (current_user,)
        )
    
    update_fields = []
    values = []
    
    if settings_in.balance is not None:
        update_fields.append("balance = %s" if USE_POSTGRES else "balance = ?")
        values.append(settings_in.balance)
    if settings_in.monthly_limit is not None:
        update_fields.append("monthly_limit = %s" if USE_POSTGRES else "monthly_limit = ?")
        values.append(settings_in.monthly_limit)
    if settings_in.start_date is not None:
        update_fields.append("start_date = %s" if USE_POSTGRES else "start_date = ?")
        values.append(settings_in.start_date)
    if settings_in.end_date is not None:
        update_fields.append("end_date = %s" if USE_POSTGRES else "end_date = ?")
        values.append(settings_in.end_date)
    
    if update_fields:
        values.append(current_user)
        cursor.execute(
            f"UPDATE settings SET {', '.join(update_fields)} WHERE user_id = {'%s' if USE_POSTGRES else '?'}",
            values
        )
    
    conn.commit()
    
    cursor.execute(
        "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = %s" if USE_POSTGRES else "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = ?",
        (current_user,)
    )
    updated_settings = cursor.fetchone()
    conn.close()
    
    if USE_POSTGRES:
        return {
            "balance": updated_settings[0],
            "monthly_limit": updated_settings[1],
            "start_date": updated_settings[2],
            "end_date": updated_settings[3],
        }
    
    return {
        "balance": updated_settings["balance"],
        "monthly_limit": updated_settings["monthly_limit"],
        "start_date": updated_settings["start_date"],
        "end_date": updated_settings["end_date"],
    }

# ============ ANALYTICS ENDPOINT ============
@app.get("/analytics")
async def get_analytics(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT category, SUM(amount) as total FROM transactions WHERE user_id = %s GROUP BY category" if USE_POSTGRES else "SELECT category, SUM(amount) as total FROM transactions WHERE user_id = ? GROUP BY category",
        (current_user,)
    )
    categories = {row[0]: row[1] for row in cursor.fetchall()}
    
    cursor.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = %s" if USE_POSTGRES else "SELECT SUM(amount) FROM transactions WHERE user_id = ?",
        (current_user,)
    )
    total_spent = cursor.fetchone()[0] or 0
    
    conn.close()
    
    return {
        "categories": categories,
        "total_spent": total_spent
    }

# ============ MONTHLY DIVISIONS ENDPOINTS ============
@app.get("/monthly-divisions")
async def get_monthly_divisions(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT category, amount FROM monthly_divisions WHERE user_id = %s" if USE_POSTGRES else "SELECT category, amount FROM monthly_divisions WHERE user_id = ?",
        (current_user,)
    )
    divisions = [{"category": row[0], "amount": row[1]} for row in cursor.fetchall()]
    conn.close()
    return {"divisions": divisions}

@app.post("/monthly-divisions")
async def save_monthly_divisions(divisions_data: MonthlyDivisionsList, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Delete existing divisions for this user
    cursor.execute("DELETE FROM monthly_divisions WHERE user_id = %s" if USE_POSTGRES else "DELETE FROM monthly_divisions WHERE user_id = ?", (current_user,))
    
    # Insert new divisions
    for division in divisions_data.divisions:
        cursor.execute(
            "INSERT INTO monthly_divisions (user_id, category, amount) VALUES (%s, %s, %s)" if USE_POSTGRES else "INSERT INTO monthly_divisions (user_id, category, amount) VALUES (?, ?, ?)",
            (current_user, division.category.upper(), division.amount)
        )
    
    conn.commit()
    conn.close()
    
    return {"message": "Monthly divisions saved successfully", "divisions": [dict(d) for d in divisions_data.divisions]}

# ============ RECURRING SETTINGS ENDPOINTS ============
@app.get("/recurring-settings", response_model=RecurringSettings)
async def get_recurring_settings(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = %s" if USE_POSTGRES else "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = ?",
        (current_user,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Recurring settings not found")
    
    if USE_POSTGRES:
        return {
            "income_amount": row[0],
            "monthly_limit": row[1],
            "start_date": row[2],
            "is_active": bool(row[3]),
            "rollover_enabled": bool(row[4])
        }
    
    return {
        "income_amount": row["income_amount"],
        "monthly_limit": row["monthly_limit"],
        "start_date": row["start_date"],
        "is_active": bool(row["is_active"]),
        "rollover_enabled": bool(row["rollover_enabled"])
    }

@app.post("/check-and-apply-recurring", response_model=ApplyRecurringResponse)
async def check_and_apply_recurring(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT * FROM recurring_settings WHERE user_id = %s AND is_active = %s" if USE_POSTGRES else "SELECT * FROM recurring_settings WHERE user_id = ? AND is_active = 1",
        (current_user, True) if USE_POSTGRES else (current_user,)
    )
    recurring = cursor.fetchone()
    
    if not recurring:
        conn.close()
        return {"applied": False}
    
    if USE_POSTGRES:
        recurring_dict = row_to_dict(cursor, recurring)
    else:
        recurring_dict = dict(recurring)
    
    today = datetime.now().date().isoformat()
    start_date = recurring_dict["start_date"]
    
    if today < start_date:
        conn.close()
        return {"applied": False}
    
    # Calculate new end date
    new_start = datetime.fromisoformat(today)
    new_end = new_start + timedelta(days=30)
    new_start_str = new_start.date().isoformat()
    new_end_str = new_end.date().isoformat()
    
    # Get current settings
    cursor.execute("SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = %s" if USE_POSTGRES else "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = ?", (current_user,))
    current_settings = cursor.fetchone()
    
    new_balance = recurring_dict["income_amount"]
    
    if recurring_dict["rollover_enabled"] and current_settings:
        if USE_POSTGRES:
            current_start = current_settings[2]
            current_end = current_settings[3]
        else:
            current_start = current_settings["start_date"]
            current_end = current_settings["end_date"]
        
        # Calculate remaining balance
        cursor.execute(
            "SELECT SUM(amount) FROM transactions WHERE user_id = %s AND date BETWEEN %s AND %s" if USE_POSTGRES else "SELECT SUM(amount) FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?",
            (current_user, current_start, current_end)
        )
        spent = cursor.fetchone()[0] or 0
        
        if USE_POSTGRES:
            current_balance = current_settings[0]
        else:
            current_balance = current_settings["balance"]
        
        remaining = max(0, current_balance - spent)
        new_balance += remaining
    
    # Update settings
    cursor.execute(
        "UPDATE settings SET balance = %s, monthly_limit = %s, start_date = %s, end_date = %s WHERE user_id = %s" if USE_POSTGRES else "UPDATE settings SET balance = ?, monthly_limit = ?, start_date = ?, end_date = ? WHERE user_id = ?",
        (new_balance, recurring_dict["monthly_limit"], new_start_str, new_end_str, current_user)
    )
    
    # Update recurring start date to next month
    next_start = new_end + timedelta(days=1)
    cursor.execute(
        "UPDATE recurring_settings SET start_date = %s WHERE user_id = %s" if USE_POSTGRES else "UPDATE recurring_settings SET start_date = ? WHERE user_id = ?",
        (next_start.date().isoformat(), current_user)
    )
    
    conn.commit()
    conn.close()
    
    return {"applied": True}


# ============ AI ENDPOINTS ============

class InsightsRequest(BaseModel):
    transactions: List[dict]
    balance: float
    monthly_limit: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class SuggestCategoryRequest(BaseModel):
    description: str

def _groq_headers():
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")
    return {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

@app.post("/ai/insights")
async def ai_insights(req: InsightsRequest, current_user: int = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not set in environment")

    # Build category summary
    cat_totals: dict = {}
    for t in req.transactions:
        cat = t.get("category", "OTHER")
        cat_totals[cat] = cat_totals.get(cat, 0) + t.get("amount", 0)

    total_spent = sum(cat_totals.values())
    period_info = ""
    if req.start_date and req.end_date:
        try:
            start = datetime.fromisoformat(req.start_date)
            end = datetime.fromisoformat(req.end_date)
            today = datetime.now()
            days_elapsed = max(1, (today - start).days)
            days_total = max(1, (end - start).days)
            period_info = f"Budget period: {req.start_date} to {req.end_date} ({days_elapsed}/{days_total} days elapsed)."
        except Exception:
            period_info = ""

    cat_lines = "\n".join(f"- {k}: ₹{v:.2f}" for k, v in sorted(cat_totals.items(), key=lambda x: -x[1]))

    prompt = f"""<s>[INST] You are a personal finance assistant. Analyse this user's spending and give practical insights.

Budget: ₹{req.monthly_limit:.2f}/month | Balance: ₹{req.balance:.2f} | Total spent: ₹{total_spent:.2f}
{period_info}

Spending by category:
{cat_lines}

Give:
1. A 1-2 sentence overall spending summary (mention if they are on track or over budget).
2. The top 2-3 categories driving spend, with specific numbers and percentages.
3. Exactly 3 short, actionable tips personalised to their actual categories.

Be concise, direct, and specific. Use ₹ for amounts. No generic advice. [/INST]"""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_API_URL,
            headers=_groq_headers(),
            json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 400}
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Groq API error: {resp.status_code}")

    text = resp.json()["choices"][0]["message"]["content"].strip()
    return {"insights": text}


class ParseTransactionRequest(BaseModel):
    text: str

@app.post("/ai/parse-transaction")
async def ai_parse_transaction(req: ParseTransactionRequest, current_user: int = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not set in environment")

    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""<s>[INST] Parse this natural language expense into JSON. Today is {today}.

Input: "{req.text}"

Return ONLY a JSON object with these fields (no markdown, no explanation):
{{
  "category": "FOOD|TRANSPORT|ENTERTAINMENT|HEALTH|UTILITIES|SHOPPING|EDUCATION|RENT|PERSONAL|OTHER",
  "amount": <number>,
  "date": "YYYY-MM-DD",
  "description": "<short description>"
}}

Rules:
- If no date mentioned, use today: {today}
- If "yesterday", subtract 1 day from today
- Amount must be a number (extract from text like "450", "₹200", "two hundred")
- Description should be concise (max 5 words)
- Category must be one of the listed options [/INST]"""

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            GROQ_API_URL,
            headers=_groq_headers(),
            json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 120}
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Groq API error")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Extract JSON from response
    import re, json as jsonlib
    match = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
    if not match:
        raise HTTPException(status_code=422, detail="Could not parse AI response")

    try:
        parsed = jsonlib.loads(match.group())
        return {
            "category":    str(parsed.get("category", "OTHER")).upper().strip(),
            "amount":      float(parsed.get("amount", 0)),
            "date":        str(parsed.get("date", today)),
            "description": str(parsed.get("description", ""))
        }
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON from AI")


@app.post("/ai/suggest-category")
async def ai_suggest_category(req: SuggestCategoryRequest, current_user: int = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not set in environment")

    prompt = f"""<s>[INST] Classify this expense description into a single category word (like FOOD, TRANSPORT, ENTERTAINMENT, HEALTH, UTILITIES, SHOPPING, EDUCATION, RENT, PERSONAL, OTHER).

Description: "{req.description}"

Reply with ONLY the category word, nothing else. [/INST]"""

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            GROQ_API_URL,
            headers=_groq_headers(),
            json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 10}
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Groq API error")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Clean up — extract first word, strip punctuation
    category = raw.strip().split()[0].upper().strip(".,!?") if raw.strip() else "OTHER"
    return {"category": category}


# ============ STATIC FILES AND ROOT ============
# Serve static files (JS, CSS)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Serve HTML file from templates folder
@app.get("/")
async def root():
    return FileResponse(BASE_DIR / "templates" / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

@app.post("/recurring-settings", response_model=RecurringSettings)
async def create_recurring_settings(settings_in: RecurringSettings, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM recurring_settings WHERE user_id = %s" if USE_POSTGRES else "DELETE FROM recurring_settings WHERE user_id = ?", (current_user,))
    
    cursor.execute(
        "INSERT INTO recurring_settings (user_id, income_amount, monthly_limit, start_date, is_active, rollover_enabled) VALUES (%s, %s, %s, %s, %s, %s)" if USE_POSTGRES else "INSERT INTO recurring_settings (user_id, income_amount, monthly_limit, start_date, is_active, rollover_enabled) VALUES (?, ?, ?, ?, ?, ?)",
        (current_user, settings_in.income_amount, settings_in.monthly_limit, settings_in.start_date, settings_in.is_active, settings_in.rollover_enabled)
    )
    conn.commit()
    
    cursor.execute(
        "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = %s" if USE_POSTGRES else "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = ?",
        (current_user,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if USE_POSTGRES:
        return {
            "income_amount": row[0],
            "monthly_limit": row[1],
            "start_date": row[2],
            "is_active": bool(row[3]),
            "rollover_enabled": bool(row[4])
        }
    
    return {
        "income_amount": row["income_amount"],
        "monthly_limit": row["monthly_limit"],
        "start_date": row["start_date"],
        "is_active": bool(row["is_active"]),
        "rollover_enabled": bool(row["rollover_enabled"])
    }

@app.put("/recurring-settings", response_model=RecurringSettings)
async def update_recurring_settings(settings_in: RecurringSettingsUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    update_fields = []
    values = []
    
    if settings_in.income_amount is not None:
        update_fields.append("income_amount = %s" if USE_POSTGRES else "income_amount = ?")
        values.append(settings_in.income_amount)
    if settings_in.monthly_limit is not None:
        update_fields.append("monthly_limit = %s" if USE_POSTGRES else "monthly_limit = ?")
        values.append(settings_in.monthly_limit)
    if settings_in.start_date is not None:
        update_fields.append("start_date = %s" if USE_POSTGRES else "start_date = ?")
        values.append(settings_in.start_date)
    if settings_in.is_active is not None:
        update_fields.append("is_active = %s" if USE_POSTGRES else "is_active = ?")
        values.append(settings_in.is_active)
    if settings_in.rollover_enabled is not None:
        update_fields.append("rollover_enabled = %s" if USE_POSTGRES else "rollover_enabled = ?")
        values.append(settings_in.rollover_enabled)
    
    if update_fields:
        values.append(current_user)
        cursor.execute(
            f"UPDATE recurring_settings SET {', '.join(update_fields)} WHERE user_id = {'%s' if USE_POSTGRES else '?'}",
            values
        )
        conn.commit()
    
    cursor.execute(
        "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = %s" if USE_POSTGRES else "SELECT income_amount, monthly_limit, start_date, is_active, rollover_enabled FROM recurring_settings WHERE user_id = ?",
        (current_user,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Recurring settings not found")
    
    if USE_POSTGRES:
        return {
            "income_amount": row[0],
            "monthly_limit": row[1],
            "start_date": row[2],
            "is_active": bool(row[3]),
            "rollover_enabled": bool(row[4])
        }
    
    return {
        "income_amount": row["income_amount"],
        "monthly_limit": row["monthly_limit"],
        "start_date": row["start_date"],
        "is_active": bool(row["is_active"]),
        "rollover_enabled": bool(row["rollover_enabled"])}

# ============================================================
# V4 FEATURES: Heatmap, Recurring Transactions, Split, Tags
# ============================================================

from typing import Dict

# ---- Pydantic Models ----

class RecurringTransaction(BaseModel):
    description: str
    category: str
    amount: float
    day_of_month: int  # 1-28
    tags: Optional[str] = ""
    is_active: bool = True

class RecurringTransactionUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    day_of_month: Optional[int] = None
    tags: Optional[str] = None
    is_active: Optional[bool] = None

class SplitTransactionCreate(BaseModel):
    description: Optional[str] = ""
    date: str
    tags: Optional[str] = ""
    splits: List[Dict]  # [{"category": "FOOD", "amount": 1200}, ...]

class TransactionTagUpdate(BaseModel):
    tags: str

class TransactionNoteUpdate(BaseModel):
    notes: str

# ---- DB Init Extension ----

def init_v4_db():
    conn = get_db()
    cursor = conn.cursor()

    if USE_POSTGRES:
        # Tags & notes on transactions
        cursor.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT ''")
        cursor.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''")
        cursor.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE")
        cursor.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group TEXT DEFAULT ''")

        # Recurring transactions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                day_of_month INTEGER NOT NULL,
                tags TEXT DEFAULT '',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_applied_month TEXT DEFAULT ''
            )
        ''')
    else:
        # SQLite: add columns gracefully
        for col_def in [
            ("tags", "TEXT DEFAULT ''"),
            ("notes", "TEXT DEFAULT ''"),
            ("is_split", "INTEGER DEFAULT 0"),
            ("split_group", "TEXT DEFAULT ''"),
        ]:
            try:
                cursor.execute(f"ALTER TABLE transactions ADD COLUMN {col_def[0]} {col_def[1]}")
            except Exception:
                pass

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                day_of_month INTEGER NOT NULL,
                tags TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_applied_month TEXT DEFAULT '',
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')

    conn.commit()
    conn.close()

init_v4_db()


# ---- Heatmap Endpoint ----

@app.get("/analytics/heatmap")
async def get_heatmap(current_user: int = Depends(get_current_user)):
    """Return daily spending totals for the past 365 days."""
    conn = get_db()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute(
            """SELECT date, SUM(amount) as total
               FROM transactions
               WHERE user_id = %s AND date >= (CURRENT_DATE - INTERVAL '364 days')::TEXT
               GROUP BY date ORDER BY date""",
            (current_user,)
        )
    else:
        cursor.execute(
            """SELECT date, SUM(amount) as total
               FROM transactions
               WHERE user_id = ? AND date >= date('now', '-364 days')
               GROUP BY date ORDER BY date""",
            (current_user,)
        )

    rows = cursor.fetchall()
    conn.close()

    data = {}
    if USE_POSTGRES:
        for row in rows:
            data[str(row[0])] = round(row[1], 2)
    else:
        for row in rows:
            data[row[0]] = round(row[1], 2)

    return {"heatmap": data}


# ---- Recurring Transactions Endpoints ----

@app.get("/recurring-transactions")
async def get_recurring_transactions(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(
        f"SELECT id, description, category, amount, day_of_month, tags, is_active, last_applied_month FROM recurring_transactions WHERE user_id = {ph} ORDER BY day_of_month",
        (current_user,)
    )
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        if USE_POSTGRES:
            result.append({
                "id": row[0], "description": row[1], "category": row[2],
                "amount": row[3], "day_of_month": row[4], "tags": row[5] or "",
                "is_active": bool(row[6]), "last_applied_month": row[7] or ""
            })
        else:
            r = dict(row)
            r["is_active"] = bool(r["is_active"])
            result.append(r)
    return {"recurring_transactions": result}


@app.post("/recurring-transactions")
async def create_recurring_transaction(rt: RecurringTransaction, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"

    if USE_POSTGRES:
        cursor.execute(
            f"INSERT INTO recurring_transactions (user_id, description, category, amount, day_of_month, tags, is_active) VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph}) RETURNING id",
            (current_user, rt.description, rt.category.upper(), rt.amount, rt.day_of_month, rt.tags or "", rt.is_active)
        )
        new_id = cursor.fetchone()[0]
    else:
        cursor.execute(
            f"INSERT INTO recurring_transactions (user_id, description, category, amount, day_of_month, tags, is_active) VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph})",
            (current_user, rt.description, rt.category.upper(), rt.amount, rt.day_of_month, rt.tags or "", rt.is_active)
        )
        new_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return {"id": new_id, "message": "Recurring transaction created"}


@app.put("/recurring-transactions/{rt_id}")
async def update_recurring_transaction(rt_id: int, rt: RecurringTransactionUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"

    cursor.execute(f"SELECT id FROM recurring_transactions WHERE id = {ph} AND user_id = {ph}", (rt_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")

    fields, values = [], []
    if rt.description is not None: fields.append(f"description = {ph}"); values.append(rt.description)
    if rt.category is not None: fields.append(f"category = {ph}"); values.append(rt.category.upper())
    if rt.amount is not None: fields.append(f"amount = {ph}"); values.append(rt.amount)
    if rt.day_of_month is not None: fields.append(f"day_of_month = {ph}"); values.append(rt.day_of_month)
    if rt.tags is not None: fields.append(f"tags = {ph}"); values.append(rt.tags)
    if rt.is_active is not None: fields.append(f"is_active = {ph}"); values.append(rt.is_active)

    if fields:
        values.append(rt_id)
        cursor.execute(f"UPDATE recurring_transactions SET {', '.join(fields)} WHERE id = {ph}", values)
        conn.commit()

    conn.close()
    return {"message": "Updated"}


@app.delete("/recurring-transactions/{rt_id}")
async def delete_recurring_transaction(rt_id: int, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT id FROM recurring_transactions WHERE id = {ph} AND user_id = {ph}", (rt_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    cursor.execute(f"DELETE FROM recurring_transactions WHERE id = {ph}", (rt_id,))
    conn.commit()
    conn.close()
    return {"message": "Deleted"}


@app.post("/recurring-transactions/apply-due")
async def apply_due_recurring(current_user: int = Depends(get_current_user)):
    """Check and apply any recurring transactions due this month."""
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    today = datetime.now()
    current_month = today.strftime("%Y-%m")

    cursor.execute(
        f"SELECT id, description, category, amount, day_of_month, tags, last_applied_month FROM recurring_transactions WHERE user_id = {ph} AND is_active = {'TRUE' if USE_POSTGRES else '1'}",
        (current_user,)
    )
    rows = cursor.fetchall()

    applied = []
    for row in rows:
        if USE_POSTGRES:
            rt_id, desc, cat, amt, dom, tags, last_month = row[0], row[1], row[2], row[3], row[4], row[5], row[6]
        else:
            r = dict(row)
            rt_id, desc, cat, amt, dom, tags, last_month = r["id"], r["description"], r["category"], r["amount"], r["day_of_month"], r["tags"], r["last_applied_month"]

        # Skip if already applied this month
        if last_month == current_month:
            continue

        # Apply if today's day >= due day
        if today.day >= dom:
            due_date = f"{current_month}-{str(dom).zfill(2)}"
            if USE_POSTGRES:
                cursor.execute(
                    f"INSERT INTO transactions (user_id, category, amount, description, date, tags) VALUES ({ph},{ph},{ph},{ph},{ph},{ph}) RETURNING id",
                    (current_user, cat, amt, desc, due_date, tags or "")
                )
            else:
                cursor.execute(
                    f"INSERT INTO transactions (user_id, category, amount, description, date, tags) VALUES ({ph},{ph},{ph},{ph},{ph},{ph})",
                    (current_user, cat, amt, desc, due_date, tags or "")
                )
            cursor.execute(
                f"UPDATE recurring_transactions SET last_applied_month = {ph} WHERE id = {ph}",
                (current_month, rt_id)
            )
            applied.append({"description": desc, "amount": amt, "date": due_date})

    conn.commit()
    conn.close()
    return {"applied": applied, "count": len(applied)}


# ---- Split Transaction Endpoint ----

@app.post("/transactions/split")
async def create_split_transaction(split: SplitTransactionCreate, current_user: int = Depends(get_current_user)):
    """Create multiple transactions from a single split."""
    import uuid as _uuid
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"

    group_id = str(_uuid.uuid4())[:8]
    created = []

    for s in split.splits:
        cat = str(s.get("category", "OTHER")).upper()
        amt = float(s.get("amount", 0))
        desc = s.get("description", split.description or "")

        if USE_POSTGRES:
            cursor.execute(
                f"INSERT INTO transactions (user_id, category, amount, description, date, tags, is_split, split_group) VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph}) RETURNING id",
                (current_user, cat, amt, desc, split.date, split.tags or "", True, group_id)
            )
            new_id = cursor.fetchone()[0]
        else:
            cursor.execute(
                f"INSERT INTO transactions (user_id, category, amount, description, date, tags, is_split, split_group) VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph})",
                (current_user, cat, amt, desc, split.date, split.tags or "", 1, group_id)
            )
            new_id = cursor.lastrowid
        created.append({"id": new_id, "category": cat, "amount": amt})

    conn.commit()
    conn.close()
    return {"created": created, "split_group": group_id, "count": len(created)}


# ---- Tags / Notes update on transactions ----

@app.patch("/transactions/{transaction_id}/tags")
async def update_transaction_tags(transaction_id: int, body: TransactionTagUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT id FROM transactions WHERE id = {ph} AND user_id = {ph}", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    cursor.execute(f"UPDATE transactions SET tags = {ph} WHERE id = {ph}", (body.tags, transaction_id))
    conn.commit()
    conn.close()
    return {"message": "Tags updated"}


@app.patch("/transactions/{transaction_id}/notes")
async def update_transaction_notes(transaction_id: int, body: TransactionNoteUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT id FROM transactions WHERE id = {ph} AND user_id = {ph}", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    cursor.execute(f"UPDATE transactions SET notes = {ph} WHERE id = {ph}", (body.notes, transaction_id))
    conn.commit()
    conn.close()
    return {"message": "Notes updated"}


# ---- Extended transaction list with tags/notes ----

@app.get("/transactions/full")
async def get_transactions_full(current_user: int = Depends(get_current_user)):
    """Return transactions including tags, notes, split info."""
    conn = get_db()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(
        f"SELECT id, category, amount, description, date, tags, notes, is_split, split_group FROM transactions WHERE user_id = {ph} ORDER BY date DESC",
        (current_user,)
    )
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        if USE_POSTGRES:
            result.append({
                "id": row[0], "category": row[1], "amount": row[2],
                "description": row[3] or "", "date": row[4],
                "tags": row[5] or "", "notes": row[6] or "",
                "is_split": bool(row[7]), "split_group": row[8] or ""
            })
        else:
            r = dict(row)
            r["is_split"] = bool(r.get("is_split", 0))
            r["tags"] = r.get("tags") or ""
            r["notes"] = r.get("notes") or ""
            r["split_group"] = r.get("split_group") or ""
            result.append(r)
    return result