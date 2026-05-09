const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Quick Fix for EBADRESP DNS Error
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const Booking = require('./models/Booking');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'laxmi_auto_secret_123';

// CORS Middleware
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:5174", 
    "https://laxmiauto-frontend.onrender.com",
    /\.onrender\.com$/
  ],
  methods: ["GET", "POST", "PATCH", "DELETE"],
  credentials: true
}));
app.use(express.json());

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kushalrokaya472_db_user:automachinelaxmi@cluster12.jbyn7zb.mongodb.net/laxmiauto_db?appName=Cluster12';

mongoose.connect(MONGODB_URI)
  .then(() => {
    const dbName = mongoose.connection.name;
    console.log(`MongoDB Connected Successfully to Cloud DB: ${dbName}`);
    seedAdmin();
  })
  .catch(err => {
    console.error('MongoDB connection error details:', err.message);
  });

// Seed Admin Function
async function seedAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL_LOGIN || 'admin@laxmiauto.com';
    const adminPassword = process.env.ADMIN_PASSWORD_LOGIN || 'admin123';
    
    let admin = await User.findOne({ email: adminEmail });
    
    if (!admin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        email: adminEmail,
        password: hashedPassword,
        role: 'admin'
      });
      console.log('Admin user created: ' + adminEmail);
    } else {
      if (process.env.RESET_ADMIN === 'true') {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        admin.password = hashedPassword;
        await admin.save();
        console.log('Admin user password reset: ' + adminEmail);
      } else {
        console.log('Admin user already exists: ' + adminEmail);
      }
    }
  } catch (error) {
    console.error('Admin seeding failed:', error);
  }
}

// Auth Middleware
const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Root Route
app.get('/', (req, res) => {
  res.send('LaxmiAuto Backend is running successfully!');
});

// Routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const newBooking = new Booking(req.body);
    const savedBooking = await newBooking.save();
    // Socket emit removed for Vercel compatibility
    sendAdminEmail(savedBooking).catch(err => console.error('Email failed:', err.message));
    res.status(201).json(savedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.patch('/api/bookings/:id/archive', protect, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (booking) sendCustomerEmail(booking).catch(err => console.error('Email failed:', err.message));
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ status: { $ne: 'archived' } }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/bookings/history', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ status: 'archived' }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/bookings/:id', protect, async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking deleted permanently' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Email Transporter (Created once to improve speed)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { 
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS 
  }
});

// Email Helpers
async function sendAdminEmail(booking) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: 'New Service Request',
    text: `New request from ${booking.name}. Phone: ${booking.phone}. Problem: ${booking.problem}`
  });
}

async function sendCustomerEmail(booking) {
  if (!booking.email || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject: 'Request Received',
    text: `Hi ${booking.name}, your request for ${booking.brand} is being processed.`
  });
}

// Export for Vercel
module.exports = app;

// Only listen if not running as a serverless function
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
