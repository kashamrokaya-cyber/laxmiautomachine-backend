const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: false }, // Added email field
  phone: { type: String, required: true },
  address: { type: String, required: true },
  brand: { type: String, required: true },
  serviceType: { type: String, required: true },
  problem: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
