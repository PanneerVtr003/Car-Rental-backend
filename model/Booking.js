// Temporary simplified schema for testing
const bookingSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    carModel: String,
    bookingId: String,
    createdAt: { type: Date, default: Date.now }
}, { strict: false }); // Allow additional fields during testing

const Booking = mongoose.model("Booking", bookingSchema, "bookings"); // Explicit collection name