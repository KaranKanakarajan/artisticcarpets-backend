const mongoose = require('mongoose');
require('dotenv').config();

async function fixAlexanderOrders() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const ordersCol = db.collection('orders');
  const usersCol = db.collection('users');

  // Find the alexander user
  const user = await usersCol.findOne({ email: 'alexander@example.com' });
  if (!user) {
    console.log('No user found with alexander@example.com');
    process.exit(0);
  }
  console.log('Alexander user:', user._id, user.email);

  // Fix all orphaned orders with alexander@artisticcarpets.com email
  const DUMMY_ID = new mongoose.Types.ObjectId('000000000000000000000000');
  const result = await ordersCol.updateMany(
    { customer: DUMMY_ID, 'customerSnapshot.email': 'alexander@artisticcarpets.com' },
    { $set: { customer: user._id } }
  );
  console.log('Fixed', result.modifiedCount, 'orders for alexander@artisticcarpets.com');
  process.exit(0);
}

fixAlexanderOrders().catch(err => { console.error(err); process.exit(1); });
