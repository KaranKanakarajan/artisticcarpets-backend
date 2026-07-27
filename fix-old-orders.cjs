const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function fixOrders() {
  await mongoose.connect(process.env.MONGO_URI);
  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }), 'orders');
  
  const orders = await Order.find({});
  let updatedCount = 0;
  for (const order of orders) {
    const subtotal = order.get('subtotal') || 0;
    const couponDiscount = order.get('couponDiscount') || 0;
    const newTotal = subtotal - couponDiscount;
    
    // Check if the current total is different from newTotal
    if (order.get('total') !== newTotal) {
      await Order.updateOne(
        { _id: order._id },
        { 
          $set: { 
            total: newTotal,
            shippingCost: 0,
            taxAmount: 0,
            taxRate: 0,
            'customerSnapshot.name': 'Alexander Sterling',
            'customerSnapshot.email': 'alexander@artisticcarpets.com'
          } 
        }
      );
      updatedCount++;
    } else if (order.get('customerSnapshot.name') === 'Guest User' || order.get('customerSnapshot.name') === 'demo' || order.get('customerSnapshot.name') === 'Guest Customer') {
      await Order.updateOne(
        { _id: order._id },
        { 
          $set: { 
            'customerSnapshot.name': 'Alexander Sterling',
            'customerSnapshot.email': 'alexander@artisticcarpets.com'
          } 
        }
      );
      updatedCount++;
    }
  }
  console.log('Updated ' + updatedCount + ' existing orders to match frontend price exactly.');
  process.exit(0);
}

fixOrders().catch(console.error);
