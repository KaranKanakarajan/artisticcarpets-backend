import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "./models/product.model.js";

// Load environment variables
dotenv.config();

// The static products array from frontend
const productsData = [
  {
    name: "Kashan Crimson",
    subtitle: "Pure Highland Wool",
    category: "Persian",
    price: 3200.00,
    rating: 4.9,
    image: "https://carpetplanet.in/cdn/shop/files/34_2.jpg?v=1768994711",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/34.jpg?v=1768994711&width=600",
    material: "Hand-Spun Wool",
    size: "8' x 10'",
    color: "Dark Red",
    shape: "Rectangle",
    description: "A premium soft beige and cream hand-woven silk carpet. The Silk Road Serenity brings an understated refinement and high-end craftsmanship to your modern home.",
    badge: "NEW ARRIVAL",
  },
  {
    name: "Oushak Vintage",
    subtitle: "Naturally Dyed Heirloom",
    category: "Vintage",
    price: 4500.00,
    rating: 5.0,
    image: "https://i.etsystatic.com/13954419/r/il/1fbc3d/3766791931/il_1588xN.3766791931_6bco.jpg",
    hoverimage: "https://plus.unsplash.com/premium_photo-1725295198184-5dde96badeba?q=80&w=1169&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    material: "Hand-Spun Wool",
    size: "9' x 12'",
    color: "Cream",
    shape: "Rectangle",
    badge: "LIMITED EDITION",
    description: "A gorgeous distressed vintage crimson and terracotta wool rug. Its antique design motifs are gently faded, reflecting generations of hand-loomed heritage.",
  },
  {
    name: "Modern Silk Abstract",
    subtitle: "Hand-tufted organic silk",
    category: "Modern",
    price: 2800.00,
    rating: 4.8,
    image: "https://carpetplanet.in/cdn/shop/files/24_2.jpg?v=1768994051",
    hoverimage: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=600&q=80",
    material: "Organic Silk",
    badge: "HEIRLOOM",
    size: "5' x 8'",
    color: "Dark Blue",
    shape: "Rectangle",
    description: "Embrace minimalist elegance with our hand-tufted abstract silk carpet. Featuring bold geometric lines in deep navy and sophisticated taupe on a cream base.",
  },
  {
    name: "Earthy Jute Runner",
    subtitle: "Sustainable flatweave",
    category: "Runners",
    price: 450.00,
    rating: 4.6,
    badge: "BEST SELLER",
    image: "https://img.tatacliq.com/images/i25//1348Wx2000H/MP000000024725420_1348Wx2000H_202507090441321.jpeg",
    hoverimage: "https://images.unsplash.com/photo-1600166898405-da9535204843?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    material: "Jute & Hemp",
    size: "Runner",
    color: "Brown",
    shape: "Rectangle",
    description: "Add a touch of rustic charm to your hallway with our earthy jute runner. Hand-woven from sustainable materials, it features natural brown tones and a durable flatweave construction perfect for high-traffic areas.",
  },
  {
    name: "Circular Medallion",
    subtitle: "Classic centerpiece",
    category: "Persian",
    badge: null,
    price: 1850.00,
    rating: 4.7,
    image: "https://ii1.pepperfry.com/media/catalog/product/b/e/494x544/beige-persian-4x6-feet-machine-made-carpet-beige-persian-4x6-feet-machine-made-carpet-o4noog.jpg",
    hoverimage: "https://images.unsplash.com/photo-1671063305887-1eb2343dfb90?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    size: "5' x 8'",
    color: "Dark Red",
    shape: "Round / Circular",
    description: "A timeless Persian-inspired medallion rug in a rich palette of dark red, cream, and warm beige. Its intricate medallion pattern makes it a stunning centerpiece for your living room or dining area.",
  },
  {
    name: "Minimalist Taupe",
    subtitle: "Scandinavian inspired",
    category: "Modern",
    price: 950.00,
    badge: null,
    rating: 4.5,
    image: "https://carpetplanet.in/cdn/shop/files/43_2.jpg?v=1768995157",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/43_1.jpg?v=1768995157",
    size: "4' x 6'",
    color: "Taupe",
    shape: "Rectangle",
    description: "Embrace Scandinavian simplicity with our minimalist taupe rug. Its understated design and neutral tone effortlessly complement modern interiors while adding warmth and texture to your space.",
  },
  {
    name: "Royal Navy Oushak",
    subtitle: "Antique reproduction",
    category: "Vintage",
    price: 5200.00,
    rating: 5.0,
    image: "https://carpetplanet.in/cdn/shop/files/34_2.jpg?v=1768994711",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/43_2.jpg?v=1768995157",
    material: "Organic Silk",
    size: "9' x 12'",
    color: "Dark Blue",
    shape: "Rectangle",
    description: "A luxurious vintage-style Oushak carpet in a deep royal navy blue. Hand-knotted with traditional motifs, this rug brings timeless elegance and rich texture to any room.",
  },
  {
    name: "Hemp Coastal Oval",
    subtitle: "Natural textures",
    category: "Outdoor",
    price: 320.00,
    rating: 4.3,
    image: "https://i.etsystatic.com/13954419/r/il/1fbc3d/3766791931/il_1588xN.3766791931_6bco.jpg",
    hoverimage: "https://plus.unsplash.com/premium_photo-1725295198184-5dde96badeba?q=80&w=1169&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    size: "4' x 6'",
    color: "Cream",
    shape: "Oval",
    description: "Bring coastal charm to your home with our natural hemp oval rug. Hand-woven with durable fibers, this eco-friendly rug adds organic texture and a relaxed vibe to any space.",
  },
  {
    name: "Crimson Runner",
    subtitle: "Hallway elegance",
    category: "Runners",
    price: 850.00,
    rating: 4.8,
    image: "https://carpetplanet.in/cdn/shop/files/37_2.jpg?v=1768994957&width=600",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/37_1.jpg?v=1768994957",
    size: "Runner",
    color: "Dark Red",
    shape: "Rectangle",
    description: "Add a touch of elegance to your hallway with our crimson runner. Hand-knotted with intricate traditional patterns, this runner features a rich red hue that complements both classic and contemporary interiors.",
  },
  {
    name: "Cream Cloud Tufted",
    subtitle: "Ultra soft bedroom rug",
    category: "Modern",
    price: 1100.00,
    rating: 4.9,
    image: "https://cdn.shopify.com/s/files/1/0645/8179/5885/files/soft-rug.jpg?v=1779280155",
    hoverimage: "https://images.unsplash.com/photo-1444362408440-274ecb6fc730?q=80&w=1174&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    material: "Viscose Blend",
    size: "8' x 10'",
    color: "Cream",
    shape: "Rectangle",
    description: "Sink your feet into pure luxury with our Cream Cloud Tufted rug. Hand-tufted with ultra-soft viscose fibers, this plush carpet adds warmth, comfort, and sophisticated texture to your bedroom or living area.",
  },
  {
    name: "Brown Earth Tones",
    subtitle: "Warm living space",
    category: "Vintage",
    price: 2100.00,
    rating: 4.7,
    image: "https://carpetplanet.in/cdn/shop/files/27_2_c7c85efb-7c1b-4cd5-bb46-739e27a2badb.jpg?v=1768994238",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/27_1_2e10796a-12fc-4c0b-b8c4-c13a6034b26c.jpg?v=1768994238",
    material: "Hand-Spun Wool",
    size: "5' x 8'",
    color: "Brown",
    shape: "Rectangle",
    description: "Add warmth and character to your living space with our vintage-inspired brown earth tones rug. Featuring traditional patterns and rich, earthy hues, this hand-spun wool carpet brings timeless elegance and cozy charm to any room.",
  },
  {
    name: "Silk Round Entryway",
    subtitle: "Make a statement",
    category: "Modern",
    price: 3400.00,
    rating: 4.9,
    image: "https://carpetplanet.in/cdn/shop/files/25_1_3a700ec5-310d-4823-9ab6-0649c72a03e8.jpg?v=1768994061",
    hoverimage: "https://carpetplanet.in/cdn/shop/files/25_2.jpg?v=1768994060",
    material: "Organic Silk",
    size: "4' x 6'",
    color: "Taupe",
    shape: "Round / Circular",
    description: "Make a statement with our silk round entryway rug. Hand-knotted with premium organic silk, this exquisite piece features a sophisticated taupe color and a timeless design that adds a touch of luxury to your entrance.",
  }
];

const seedDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || "mongodb+srv://user1:q2Z2t4GkR6o53yL0@cluster0.0szfg9x.mongodb.net/artisticcarpets?retryWrites=true&w=majority&appName=Cluster0";
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB for Seeding...");

    // Remove existing seeded products if needed (Optional)
    // await Product.deleteMany({});
    
    for (const item of productsData) {
      // Create random slug
      const baseSlug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const randomStr = Math.random().toString(36).substring(2, 6);
      const slug = `${baseSlug}-${randomStr}`;
      
      const sku = `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const newProduct = new Product({
        title: item.name,
        slug: slug,
        sku: sku,
        shortDescription: item.subtitle,
        description: item.description,
        category: item.category,
        price: item.price,
        stock: 50, // default stock
        material: item.material || "Blend",
        size: item.size,
        color: item.color,
        shape: item.shape,
        thumbnail: { filename: "thumb.jpg", path: item.image },
        images: item.hoverimage ? [{ filename: "hover.jpg", path: item.hoverimage }] : [],
        isNewArrival: item.badge === "NEW ARRIVAL",
        isBestSeller: item.badge === "BEST SELLER",
        isFeatured: item.badge === "HEIRLOOM" || item.badge === "LIMITED EDITION",
        isTrending: item.rating >= 4.8,
        ratingAverage: item.rating,
        ratingCount: Math.floor(Math.random() * 50) + 10,
        status: "active"
      });
      
      await newProduct.save();
      console.log(`Seeded: ${item.name}`);
    }

    console.log("Database seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDB();
