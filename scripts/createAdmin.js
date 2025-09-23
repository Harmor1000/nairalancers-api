import mongoose from 'mongoose';
import User from '../models/user.model.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Create admin user or make existing user admin
const createAdmin = async () => {
  try {
    // Get email from command line arguments
    const email = process.argv[2];
    
    if (!email) {
      console.log('❌ Please provide an email address');
      console.log('Usage: node createAdmin.js user@example.com');
      process.exit(1);
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      console.log('Please make sure the user is registered first');
      process.exit(1);
    }

    // Check if user is already admin
    if (user.isAdmin) {
      console.log(`✅ User ${email} is already an admin`);
      process.exit(0);
    }

    // Make user admin
    await User.findByIdAndUpdate(user._id, { 
      isAdmin: true 
    });

    console.log(`🎉 Successfully made ${email} an admin!`);
    console.log(`👤 User: ${user.firstname} ${user.lastname} (@${user.username})`);
    console.log(`🔗 Admin Panel: http://localhost:5173/admin`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createAdmin();
};

main();
