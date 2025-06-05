# Secure Journal App Demo

## What You'll See When You Launch

### 1. First Time Setup (New Users)

When you first launch the app, you'll see:

```
🔒 Secure Journal
Your thoughts, encrypted and secure

🛡️ Your journal entries will be encrypted with AES-256 encryption

Create Password: [__________________]
Confirm Password: [__________________]

[Create Secure Journal]
```

- **Password strength indicator** shows in real-time
- **Validation** ensures passwords match and are secure
- **Beautiful dark theme** with encryption notice

### 2. Login Screen (Returning Users)

```
🔒 Secure Journal
Your thoughts, encrypted and secure

Password: [__________________]

[Unlock Journal]
```

- Clean, secure login interface
- Password field is protected
- Invalid attempts show error messages

### 3. Main App Interface

Once authenticated, you'll see:

```
┌─ Secure Journal ──────────────── Settings | Logout ─┐
│                                                     │
│ ┌─ Journal Entries ──┐ ┌─ Welcome to Secure Journal ─┐ │
│ │                   │ │                             │ │
│ │ + New Entry       │ │  Your thoughts are encrypted │ │
│ │ ─────────────────  │ │  with AES-256 encryption.   │ │
│ │ Mon Jun 3, 2024   │ │                             │ │
│ │ Sun Jun 2, 2024   │ │  Select an existing entry   │ │
│ │ Sat Jun 1, 2024   │ │  or create a new one.       │ │
│ │                   │ │                             │ │
│ │                   │ │                             │ │
│ └───────────────────┘ └─────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Key Security Features in Action

### ✅ AES-256 Encryption
- All text is encrypted before saving to disk
- Files stored with `.enc` extension
- Only decrypted in memory when viewing

### ✅ Password Protection
- bcrypt hashing with salt
- No plain text password storage
- Strong password requirements

### ✅ Secure Session Management
- Must authenticate on every app launch
- Logout clears encryption keys from memory
- Auto-save with encryption

## Dark Mode Experience

### 🎨 Beautiful Dark Theme
- Deep black backgrounds (`#1a1a1a`)
- Comfortable gray sidebars (`#2d2d2d`)
- Blue accent colors for interactions
- High contrast text for readability

### 🎯 User Experience Features
- **Real-time password strength** indicator
- **Visual feedback** for all actions
- **Smooth animations** and transitions
- **Keyboard shortcuts** (Ctrl+S to save)

## What Happens Behind the Scenes

1. **Creating an Entry**:
   ```
   User types text → Save clicked → AES-256 encryption → File saved as .enc
   ```

2. **Loading an Entry**:
   ```
   File selected → Read .enc file → AES-256 decryption → Display in editor
   ```

3. **Password Change**:
   ```
   New password → Decrypt all entries → Re-encrypt with new password → Update hash
   ```

## File System After Use

```
journal-app/
├── data/
│   ├── 2024-06-04.enc  ← Encrypted journal entry
│   ├── 2024-06-03.enc  ← Encrypted journal entry
│   └── 2024-06-02.enc  ← Encrypted journal entry
├── config/
│   └── password.hash   ← bcrypt hashed password
└── ...
```

## Try These Features:

1. **Create a new entry** - Click "+ New Entry"
2. **Test password strength** - Try weak vs strong passwords
3. **Auto-save** - Switch between entries
4. **Settings** - Change your password
5. **Logout/Login** - Test the security
6. **Delete protection** - Try deleting an entry

## Security Verification

To verify the encryption is working:

1. Create a journal entry with some text
2. Save and close the app
3. Navigate to the `data/` folder
4. Open any `.enc` file in a text editor
5. You'll see encrypted gibberish instead of your text! 🎉

Your thoughts are truly secure! 🔒✨

