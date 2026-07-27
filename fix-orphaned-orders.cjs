const mongoose = require('mongoose');
require('dotenv').config();

async function fixOrphanedOrders() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const ordersCol = db.collection('orders');
  const usersCol = db.collection('users');

  // Find all orders with the dummy customer ID
  const DUMMY_ID = new mongoose.Types.ObjectId('000000000000000000000000');
  const orphanedOrders = await ordersCol.find({ customer: DUMMY_ID }).toArray();
  console.log(`Found ${orphanedOrders.length} orphaned orders with dummy customer ID`);

  // Also show ALL orders for debugging
  const allOrders = await ordersCol.find({}, { projection: { orderNumber: 1, customer: 1, 'customerSnapshot.email': 1, total: 1 } }).toArray();
  console.log('All orders in DB:');
  allOrders.forEach(o => console.log(` - ${o.orderNumber}: customer=${o.customer}, email=${o.customerSnapshot?.email}, total=${o.total}`));

  // Show all users
  const allUsers = await usersCol.find({}, { projection: { email: 1, firstName: 1, lastName: 1 } }).toArray();
  console.log('\nAll users in DB:');
  allUsers.forEach(u => console.log(` - ${u._id}: ${u.firstName} ${u.lastName} <${u.email}>`));

  let fixed = 0;
  for (const order of orphanedOrders) {
    const email = order.customerSnapshot?.email;
    if (!email || email === 'guest@example.com') {
      console.log(`  Skipping order ${order.orderNumber} — no real email`);
      continue;
    }

    const user = await usersCol.findOne({ email });
    if (!user) {
      console.log(`  No user found for email: ${email}`);
      continue;
    }

    await ordersCol.updateOne(
      { _id: order._id },
      { $set: { customer: user._id } }
    );
    console.log(`  Fixed order ${order.orderNumber}: customer set to ${user._id} (${user.email})`);
    fixed++;
  }

  console.log(`\nFixed ${fixed} orders.`);
  process.exit(0);
}

fixOrphanedOrders().catch(err => {
  console.error(err);
  process.exit(1);
});
