
import express from "express";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    console.log("Body:", req.body);
    next();
});

// MongoDB connection with better error handling
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://panneerycse2022_db_user:Lo3FMmxKxezMZMCk@cluster2.0hv1qdo.mongodb.net/car_rental?retryWrites=true&w=majority&appName=Cluster2";

console.log("Connecting to MongoDB...");
console.log("Connection string:", MONGODB_URI.replace(/:[^:]*@/, ':****@')); // Hide password

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log("✅ MongoDB connected successfully!");
    console.log("Database:", mongoose.connection.db.databaseName);
})
.catch(err => {
    console.error("❌ MongoDB connection failed!");
    console.error("Error:", err.message);
    console.error("Full error:", err);
});

// Connection events
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
});

// Simplified schema for testing
const bookingSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    carModel: String,
    carId: Number,
    pickupDate: Date,
    returnDate: Date,
    pickupLocation: String,
    specialRequests: String,
    dailyRate: Number,
    rentalDays: Number,
    totalAmount: Number,
    bookingId: { type: String, unique: true },
    status: { type: String, default: "confirmed" },
    createdAt: { type: Date, default: Date.now }
}, {
    collection: 'bookings', // Explicit collection name
    strict: false // Allow additional fields
});

const Booking = mongoose.model("Booking", bookingSchema);

// Health check endpoint
app.get("/", (req, res) => {
    res.json({
        message: "🚗 Car Rental Backend API",
        status: "running",
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        version: "1.0.0"
    });
});

// Test database connection
app.get("/api/db-status", async (req, res) => {
    try {
        const state = mongoose.connection.readyState;
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        
        if (state !== 1) {
            return res.json({
                success: false,
                message: `Database is ${states[state]}`,
                state: states[state]
            });
        }
        
        // Try to count documents to verify connection
        const count = await Booking.countDocuments().catch(() => -1);
        
        res.json({
            success: true,
            message: "Database is connected and responsive",
            state: states[state],
            bookingCount: count,
            database: mongoose.connection.db.databaseName
        });
    } catch (error) {
        res.json({
            success: false,
            message: "Database check failed",
            error: error.message,
            state: mongoose.connection.readyState
        });
    }
});

// POST /api/bookings - CREATE booking
app.post("/api/bookings", async (req, res) => {
    console.log("\n=== NEW BOOKING REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
        console.error("Database not connected!");
        return res.status(503).json({
            success: false,
            message: "Database not available. Please try again later.",
            error: "Database disconnected"
        });
    }
    
    try {
        const {
            name,
            email,
            phone,
            carModel,
            carId,
            pickupDate,
            returnDate,
            location,
            requests,
            dailyRate,
            rentalDays,
            totalAmount
        } = req.body;

        // Basic validation
        if (!name || !email || !phone || !carModel) {
            console.log("Validation failed: Missing required fields");
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields: name, email, phone, car model"
            });
        }

        // Generate booking ID
        const bookingId = `CR${Date.now()}${Math.floor(Math.random() * 1000)}`;
        console.log("Generated Booking ID:", bookingId);

        // Create booking object
        const bookingData = {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            carModel: carModel,
            carId: parseInt(carId) || 1,
            pickupDate: new Date(pickupDate),
            returnDate: new Date(returnDate),
            pickupLocation: location,
            specialRequests: requests || "",
            dailyRate: parseFloat(dailyRate) || 0,
            rentalDays: parseInt(rentalDays) || 1,
            totalAmount: parseFloat(totalAmount) || 0,
            bookingId: bookingId,
            status: "confirmed"
        };

        console.log("Booking data to save:", bookingData);

        // Try to save to database
        let savedBooking;
        try {
            const newBooking = new Booking(bookingData);
            savedBooking = await newBooking.save();
            console.log("✅ Booking saved successfully:", savedBooking._id);
        } catch (dbError) {
            console.error("❌ Database save error:", dbError.message);
            
            // Check for duplicate key error
            if (dbError.code === 11000) {
                // Retry with new booking ID
                bookingData.bookingId = `CR${Date.now()}${Math.floor(Math.random() * 10000)}`;
                const retryBooking = new Booking(bookingData);
                savedBooking = await retryBooking.save();
                console.log("✅ Booking saved after retry:", savedBooking._id);
            } else {
                throw dbError;
            }
        }

        // Send success response (skip email for now to simplify)
        res.status(201).json({
            success: true,
            message: "🎉 Booking confirmed successfully!",
            bookingId: savedBooking.bookingId,
            booking: {
                id: savedBooking._id,
                name: savedBooking.name,
                carModel: savedBooking.carModel,
                pickupDate: savedBooking.pickupDate,
                totalAmount: savedBooking.totalAmount
            },
            timestamp: new Date().toISOString()
        });

        // Log success
        console.log("✅ Booking response sent successfully");

    } catch (error) {
        console.error("❌ Booking processing error:", error);
        console.error("Error stack:", error.stack);
        
        // Determine error type
        let statusCode = 500;
        let errorMessage = "An unexpected error occurred. Please try again.";
        
        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = "Invalid booking data provided.";
        } else if (error.code === 11000) {
            statusCode = 409;
            errorMessage = "Duplicate booking detected. Please try again.";
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: error.code
        });
    }
});

// GET all bookings (for testing)
app.get("/api/bookings", async (req, res) => {
    try {
        const bookings = await Booking.find().limit(10).sort({ createdAt: -1 });
        res.json({
            success: true,
            count: bookings.length,
            bookings: bookings.map(b => ({
                id: b._id,
                bookingId: b.bookingId,
                name: b.name,
                carModel: b.carModel,
                status: b.status,
                createdAt: b.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch bookings",
            error: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Unhandled application error:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
    console.log(`📊 Database state: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});
