const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bcrypt = require("bcrypt"); 
const jwt = require("jsonwebtoken");
const db = require('./db');
const util = require("util"); 

require("dotenv").config();
console.log("Loaded JWT Secret:", process.env.JWT_SECRET);

const app = express();
app.use(express.static('public')); 
app.use(express.static(path.join(__dirname, "public")));


app.use('/images', express.static('uploads'));
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'images')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
  
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  }




//register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  console.log("📩 Received registration request:", req.body); // Debugging log

  // Check if data is missing
  if (!username || !email || !password) {
      console.log("⚠️ Missing fields");
      return res.status(400).json({ message: "All fields are required!" });
  }

  // Check if the user already exists
  const checkUser = "SELECT * FROM users WHERE email = ?";
  db.query(checkUser, [email], async (err, results) => {
      if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Error checking user" });
      }

      if (results.length > 0) {
          console.log("User already exists!");
          return res.status(400).json({ message: "User already exists!" });
      }

      // Hash password before storing it
      try {
          const hashedPassword = await bcrypt.hash(password, 10);
          console.log(" Password hashed successfully.");

          const insertUser = "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
          db.query(insertUser, [username, email, hashedPassword], (err, result) => {
              if (err) {
                  console.error("Error inserting user:", err);
                  return res.status(500).json({ message: "Error registering user" });
              }
              console.log("User registered successfully!");
              res.status(201).json({ message: "User registered successfully!" });
          });
      } catch (hashError) {
          console.error("Error hashing password:", hashError);
          res.status(500).json({ message: "Error processing request" });
      }
  });
});


//booking history
app.get("/booking-history", async (req, res) => {
  try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
          return res.status(401).json({ message: "Unauthorized. Token missing." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userEmail = decoded.email;

      const query = `
          SELECT ub.booking_id, c.model, b.pickup_date, b.return_date 
          FROM user_bookings ub
          JOIN bookings b ON ub.booking_id = b.id
          JOIN cars c ON b.car_id = c.id
          WHERE ub.user_email = ?`;

      db.query(query, [userEmail], (err, results) => {
          if (err) {
              console.error("Database error:", err);
              return res.status(500).json({ message: "Server Error" });
          }
          res.json(results);
      });
  } catch (error) {
      console.error("JWT Verification Error:", error);
      res.status(403).json({ message: "Invalid or expired token" });
  }
});


//available-cars for bookt.html
app.get("/api/available-cars", async (req, res) => {
    try {
        const query = "SELECT DISTINCT model, fuel_type, category, color FROM cars WHERE availability>0";
        const [rows] = await db.promise().query(query);
        if (!rows.length) {
            return res.json({ success: false, message: "No cars available." });
        }

        res.json({ success: true, cars: rows });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

const query = util.promisify(db.query).bind(db); //convert db.query() to use Promises

//book car
app.post("/book", async (req, res) => {
    try {
      const { car_id, pickup_date, return_date, user_email } = req.body;
  
      console.log("Booking request received:", req.body);
  
      if (!car_id || !pickup_date || !return_date || !user_email) {
        console.error("⚠ Missing fields in request body");
        return res.status(400).json({ message: "All fields are required" });
      }
  
      //get cardetails
      const carResult = await query("SELECT * FROM cars WHERE id = ?", [car_id]);
  
      if (carResult.length === 0) {
        return res.status(400).json({ message: "Car not found" });
      }
  
      const car = carResult[0];
  
      if (car.availability <= 0) {
        return res.status(400).json({ message: "Car is not available for booking." });
      }
  
      //insert into bookings table
      const insertResult = await query(
        "INSERT INTO bookings (car_id, pickup_date, return_date) VALUES (?, ?, ?)",
        [car_id, pickup_date, return_date]
      );
  
      const bookingId = insertResult.insertId;
      console.log("Booking inserted with ID:", bookingId);
  
      //insert into user_bookings table
      await query("INSERT INTO user_bookings (booking_id, user_email) VALUES (?, ?)", [bookingId, user_email]);
      console.log("User booking inserted");
  
      // Decrement car availability
      await query("UPDATE cars SET availability = availability - 1 WHERE id = ?", [car_id]);
      console.log("Car availability updated");
    } catch (error) {
      console.error("Booking error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

//profile.html history related
app.post("/book-car", async (req, res) => {
  try {
      const { car_id, pickup_date, return_date } = req.body;
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
          return res.status(401).json({ message: "Unauthorized. Token missing." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "default key");
      const userEmail = decoded.email;

      //insert into bookings table
      const bookingQuery = "INSERT INTO bookings (car_id, pickup_date, return_date) VALUES (?, ?, ?)";
      db.query(bookingQuery, [car_id, pickup_date, return_date], (err, result) => {
          if (err) {
              console.error("Error inserting into bookings:", err);
              return res.status(500).json({ message: "Server Error" });
          }

          const bookingId = result.insertId;

          //insert into user_bookings table
          const userBookingQuery = "INSERT INTO user_bookings (user_email, booking_id) VALUES (?, ?)";
          db.query(userBookingQuery, [userEmail, bookingId], (err) => {
              if (err) {
                  console.error("Error inserting into user_bookings:", err);
                  return res.status(500).json({ message: "Server Error" });
              }

              res.json({ message: "Booking successful", bookingId });
          });
      });
  } catch (error) {
      console.error("JWT Verification Error:", error);
      res.status(403).json({ message: "Invalid or expired token" });
  }
});

app.post("/bookCar", (req, res) => {
  const { car_id, pickup_date, return_date, user_email } = req.body;
  if (!car_id || !pickup_date || !return_date || !user_email) {
    return res.status(400).json({ success: false, message: "All fields are required!" });
  }

  //insert into bookings table
  const bookingQuery = "INSERT INTO bookings (car_id, pickup_date, return_date) VALUES (?, ?, ?)";
  db.query(bookingQuery, [car_id, pickup_date, return_date], (err, result) => {
    if (err) {
      console.error("Error inserting booking:", err);
      return res.status(500).json({ success: false, message: "Database error while inserting booking" });
    }

    const bookingId = result.insertId;
    const userBookingQuery = "INSERT INTO user_bookings (user_email, booking_id) VALUES (?, ?)";
    db.query(userBookingQuery, [user_email, bookingId], (err) => {
      if (err) {
        console.error("Error inserting into user_bookings:", err);
        return res.status(500).json({ success: false, message: "Database error while inserting user booking" });
      }
      const getCarQuery = "SELECT model FROM cars WHERE id = ?";
      db.query(getCarQuery, [car_id], (err, carResult) => {
        if (err || carResult.length === 0) {
          console.error("Error fetching car model:", err);
          return res.status(500).json({ success: false, message: "Error fetching car details" });
        }

        const carModel = carResult[0].model;

        res.json({ success: true, message: "Booking successful and email sent!" });
      });
    });
  });
});


// User Login
app.post("/login", async (req, res) => {
  try {
      const { email, password } = req.body;
      console.log("Received login request:", email, password);

      const [rows] = await db.promise().execute(
          "SELECT id, username, email, password FROM users WHERE email = ?", 
          [email]
      );

      console.log("Query result:", rows);

      if (!rows || rows.length === 0) {
          console.log("No user found");
          return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = rows[0];
      console.log("User found:", user);

      if (!user.email) {
          console.error("Error: Email is missing in database result!");
          return res.status(500).json({ message: "Email missing in database result." });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      console.log("Password match:", isPasswordValid);

      if (!isPasswordValid) {
          console.log("Password incorrect");
          return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = jwt.sign(
          { userId: user.id, user_email: user.email }, 
          process.env.JWT_SECRET, 
          { expiresIn: "1h" }
      );

      console.log("Generated Token:", token);

      res.status(200).json({ message: "Login successful", token });

  } catch (error) {
      console.error("Error in login:", error);
      res.status(500).json({ message: "Error logging in" });
  }
});

//route to add a new car
app.post('/api/admin/add-car', upload.single('carImage'), (req, res) => {
  const { model, category, price_per_day, availability, fuel_type, color } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Car image is required' });
  }

  const image_url = `/images/${req.file.filename}`;

  const query = `
    INSERT INTO cars (model, category, price_per_day, availability, fuel_type, color, image_url) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.execute(
    query,
    [model, category, price_per_day, availability, fuel_type, color, image_url],
    (err, result) => {
      if (err) {
        console.error('Error adding car:', err);
        return res.status(500).json({ message: 'Error adding car' });
      }
      res.status(201).json({ message: 'Car added successfully', carId: result.insertId });
    }
  );
});


// Route to get all cars with updated availability
app.get('/api/cars', (req, res) => {
  const query = 'SELECT * FROM cars';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching cars:', err);
      return res.status(500).json({ message: 'Error fetching cars' });
    }

    const updatedResults = results.map((car) => ({
      ...car,
      image_url: `http://localhost:${PORT}${car.image_url}`,
    }));

    res.json(updatedResults);  //Return all cars with current availability
  });
});



//book through book page(direct book)
app.get('/api/car-id/:brand', (req, res) => {
  const carBrand = req.params.brand;
  console.log(`Received car brand: ${carBrand}`);

  db.query('SELECT id FROM cars WHERE model = ?', [carBrand], (err, results) => {
      if (err) {
          console.error('Error fetching car ID:', err);
          return res.status(500).json({ message: 'Error fetching car ID' });
      }

      if (results.length === 0) {
          console.log(`Car not found in database: ${carBrand}`);
          return res.status(404).json({ message: 'Car not found' });
      }

      console.log(`Car ID found: ${results[0].id}`);
      res.json({ car_id: results[0].id });
  });
});

  // API endpoint to return car by ID
  app.get("/cars/:id", (req, res) => {
    const carId = req.params.id;
    const query = "SELECT * FROM cars WHERE id = ?";
  
    db.query(query, [carId], (err, results) => {
      if (err) {
        console.error("Error fetching car:", err);
        res.status(500).json({ message: "Server error" });
      } else if (results.length === 0) {
        res.status(404).json({ message: "Car not found" });
      } else {
        res.json(results[0]);
      }
    });
  });

// Route to book a car
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];  

  if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET); 
      req.user_email = decoded.user_email; 
      next();
  } catch (error) {
      return res.status(403).json({ message: "Invalid or expired token" });
  }
};

app.post('/api/book', verifyToken, (req, res) => {
    console.log("Received Booking Request:", req.body);

    const { carId, pickupDate, returnDate } = req.body;
    const user_email=req.user_email;
    console.log("Extracted Values:");
    console.log("Car ID:", carId);
    console.log("Pickup Date:", pickupDate);
    console.log("Return Date:", returnDate);
     console.log("email",user_email);
    if (!carId || !pickupDate || !returnDate||!user_email) {
        return res.status(400).json({ message: 'Car ID, pickup date, return date, and user must be logged in' });
    }
  
    const today = new Date().toISOString().split('T')[0];
  
    if (pickupDate < today) {
        return res.status(400).json({ message: 'Pickup date cannot be in the past' });
    }
  
    if (returnDate < pickupDate) {
        return res.status(400).json({ message: 'Return date cannot be before pickup date' });
    }
  
    const sql = `
    SELECT COUNT(*) AS booked_count
    FROM bookings
    WHERE car_id = ? 
    AND ((pickup_date BETWEEN ? AND ?) 
    OR (return_date BETWEEN ? AND ?))
`;

db.query(sql, [carId, pickupDate, returnDate, pickupDate, returnDate], (err, results) => {
    if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database query failed" });
    }
  
            const bookedCount = results[0].booked_count;
  
            const availabilityQuery = 'SELECT availability FROM cars WHERE id = ?';
  
            db.query(availabilityQuery, [carId], (availabilityErr, availabilityResults) => {
                if (availabilityErr) {
                    console.error('Error fetching car availability:', availabilityErr);
                    return res.status(500).json({ message: 'Error fetching car availability' });
                }
  
                const totalAvailability = availabilityResults[0].availability;
  
                if (bookedCount >= totalAvailability) {
                    return res.status(400).json({ message: 'Car is not available for the selected dates' });
                }
  
                const updateAvailabilityQuery = `UPDATE cars SET availability = availability - 1 WHERE id = ?`;
  
                db.query(updateAvailabilityQuery, [carId], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating car availability:', updateErr);
                        return res.status(500).json({ message: 'Error updating availability' });
                    }
  
                    const bookingQuery = `INSERT INTO bookings (car_id, pickup_date, return_date) VALUES (?, ?, ?)`;
  
                    db.execute(bookingQuery, [carId, pickupDate, returnDate], (bookingErr, results) => {
                        if (bookingErr) {
                            console.error('Error booking car:', bookingErr);
                            return res.status(500).json({ message: 'Error processing booking' });
                        }
  
                        const booking_id = results.insertId; //Get the booking ID
  
                        // Insert into user_bookings using extracted user_email
                        const userBookingQuery = `
                            INSERT INTO user_bookings (user_email, booking_id) 
                            VALUES (?, ?)
                        `;
  
                        db.execute(userBookingQuery, [user_email, booking_id], (userBookingErr) => {
                            if (userBookingErr) {
                                console.error('Error inserting into user_bookings:', userBookingErr);
                                return res.status(500).json({ message: 'Error saving booking history' });
                            }
  
                            res.status(200).json({ message: 'Booking successful and saved in history' });
                        });
                    });
                });
            });
        }
    );
  });


//
  
// Cancel a booking
app.post('/cancel-booking', authenticateToken, (req, res) => {
    const bookingId = req.body.bookingId;
  
    const updateBookingSql = 'UPDATE bookings SET status = ? WHERE id = ?';
  
    db.query(updateBookingSql, ['cancelled', bookingId], (err, result) => {
      if (err) {
        console.error('Error updating booking status:', err);
        return res.status(500).json({ error: 'Failed to cancel booking' });
      }
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
  
      res.json({ message: 'Booking cancelled successfully' });
    });
  });
  
  
  


//profile.html related
app.get("/api/user-bookings", async (req, res) => {
  try {
      const token = req.headers.authorization?.split(" ")[1]; 
      console.log("Received token:", token); 

      if (!token) {
          return res.status(401).json({ message: "Access denied. No token provided." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded token:", decoded); 

      const user_email = decoded.user_email; 
      console.log("User email from token:", user_email);

      if (!user_email) {
          return res.status(401).json({ message: "Invalid token, user email missing." });
      }

      const query = `
           SELECT ub.*, c.model, c.category, c.price_per_day, c.color, c.fuel_type, c.image_url, b.pickup_date, b.return_date, b.status
FROM user_bookings ub
JOIN bookings b ON ub.booking_id = b.id 
JOIN cars c ON b.car_id = c.id  
WHERE ub.user_email = ?
ORDER BY b.id DESC
`;

      const [rows] = await db.promise().execute(query, [user_email]);

      console.log("Fetched bookings:", rows);

      res.status(200).json({ success: true, bookings: rows });

  } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Error retrieving bookings." });
  }
});

const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." });
  }
  try {
      const decoded = jwt.verify(token, "hello"); 
      req.user = decoded; 
      next();
  } catch (error) {
      res.status(400).json({ error: "Invalid token." });
  }
};

app.get('/profile', authenticateUser, async (req, res) => {
  const userEmail = req.user.user_email; 
  console.log("User email from token:", userEmail);
  try {
      const [userBookings] = await db.execute(
          "SELECT booking_id FROM user_bookings WHERE user_email = ?",
          [userEmail]
      );
      console.log("Fetched booking IDs:", userBookings);

      if (userBookings.length === 0) {
          return res.json({ message: "No bookings found" });
      }

      const bookingIds = userBookings.map(b => b.booking_id);

      const [carDetails] = await db.execute(`
          SELECT c.model, c.category, c.price_per_day, c.image_url, 
                 c.color, c.fuel_type, b.pickup_date, b.return_date
          FROM bookings b
          JOIN cars c ON b.car_id = c.id
          WHERE b.id IN (${bookingIds.join(',')})
      `);

      console.log("Fetched car details:", carDetails);
      res.json(carDetails);
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
  }
});


app.get('/api/car_images/model/:model', (req, res) => {
  const model = req.params.model;

  db.query('SELECT url FROM car_images WHERE model = ?', [model], (err, results) => {
    if (err) {
      console.error('Error fetching images:', err);
      return res.status(500).json({ message: 'Error fetching car images' });
    }

    if (results.length === 0) {
      return res.json([]);
    }

    res.json(results.map((image) => ({
      url: `http://localhost:${PORT}${image.url}`,
    })));
  });
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
