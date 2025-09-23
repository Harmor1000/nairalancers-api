import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import User from '../models/user.model.js';

(async () => {
  try {
    dotenv.config();
    const mongo = process.env.MONGO;
    if (!mongo) {
      console.error('MONGO connection string is missing in .env');
      process.exit(1);
    }

    await mongoose.connect(mongo);

    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const username = process.env.SEED_ADMIN_USERNAME || 'superadmin';
    const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      const hash = bcrypt.hashSync(password, 5);
      user = await User.create({
        firstname: 'Super',
        lastname: 'Admin',
        username,
        email: email.toLowerCase(),
        password: hash,
        isAdmin: true,
        isSuperAdmin: true,
        emailVerified: true,
        lastSeen: new Date(),
      });
      console.log('Created new super admin:', { email, username });
    } else {
      // Ensure admin flags are set
      user.isAdmin = true;
      user.isSuperAdmin = true;
      if (!bcrypt.compareSync(password, user.password)) {
        // Optionally reset password to the seed one
        user.password = bcrypt.hashSync(password, 5);
      }
      await user.save();
      console.log('Updated existing user to super admin:', { email, username });
    }

    console.log('Seed complete. Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
