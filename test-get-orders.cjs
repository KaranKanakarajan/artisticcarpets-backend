
const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ id: '6a66fb30e145043e9defc8a5', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
const axios = require('axios');

axios.get('http://localhost:5000/api/orders/my', {
  headers: { Authorization: `Bearer ${token}` }
}).then(res => console.log(JSON.stringify(res.data, null, 2)))
.catch(err => console.error(err.response?.data || err.message));
