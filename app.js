require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken'); 
const admin = require('firebase-admin');
const serviceAccount = require('./agora-call-service-firebase-adminsdk-fbsvc-32c6760351.json');


const app = express();

// Middleware
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

// Import User model
const User = require('./models/User');

// Secret key for JWT (store this securely in .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Signup route (already implemented)
app.post('/signup', async (req, res) => {
  try {
    const { username, email, password, fcmToken } = req.body;

    // Validate input
    if (!username || !email || !password || !fcmToken) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      fcmToken,
    });

    // Save user to database
    await newUser.save();

    // Respond with success message
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token (optional)
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    // Respond with success message and token
    res.status(200).json({
      message: 'Login successful',
      token, // Include the token in the response
      user: {
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


//sent notification for call

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Send push notification route
app.post('/send-call', async (req, res) => {
  try {
    const { 
      fcmToken, 
      title, 
      body, 
      callerId, 
      callType, 
      roomId 
    } = req.body;

    // More comprehensive input validation
    if (!fcmToken || !title || !body || !callerId || !roomId) {
      return res.status(400).json({ 
        message: 'Missing required notification parameters' 
      });
    }

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        type: 'call',
        callerId: callerId.toString(),
        callType: callType || 'video', // Default to video
        roomId: roomId.toString(),
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);

    res.status(200).json({
      message: 'Notification sent successfully',
      firebaseResponse: response,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
});
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});