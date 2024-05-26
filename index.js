const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// console.log(p.rocess.env.DB_USER);
// foodZone
// ZdbMuvuZku2kczIP

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nhg2oh1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJwt = (req,res,next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized Access(401)' });
  }
  const token = authorization.split(" ")[1];
  if (token) {
    next();
  } else {
    return res.send({ error: true, message: "unauthorized access" });
  }
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("foodzone").collection("users");
    const recipesCollection = client.db("foodzone").collection("recipes");
    const paymentCollection = client.db("foodzone").collection("payment");

    app.post("/users", async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
            return res.json({
            result: false,
            message: "User Already Exists",
            });
        }
        const result = await usersCollection.insertOne(user);
        if (result.insertedId) {
            return res.json({
            result: true,
            message: "User Created Successfully",
            });
        }
    });
      
    app.get("/users/:email", verifyJwt, async (req, res) => {
        const email = req.params.email;
        // console.log(email);
        const query = { email: email };
        const result = await usersCollection.findOne(query);
        res.send(result);
    });
      
    app.post("/create-recipe", verifyJwt, async(req,res)=>{
        const body = req.body;
        const result = await recipesCollection.insertOne(body);
        if (result.insertedId) {
            res.json({
                result: true,
                message: "Recipe Added Successfully"
            })
        }
    })

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", verifyJwt, async (req, res) => {
      const body = req.body;
      const email = body.email;
      const price = body.price;
      let coin = 0;

      if (price == 1) {
        coin = 100;
      } else if (price == 5) {
        coin = 500;
      } else {
        coin = 1000;
      }

      const result = await paymentCollection.insertOne(body);
      if (result.insertedId) {
        const query = { email: email };
        const userInfo = await usersCollection.findOne(query);
        const updatedCoin = userInfo.coin + coin
        const updatedDoc = {
          $set: {
            coin: updatedCoin
          }
        }
        const updatedInfo = await usersCollection.updateOne(query, updatedDoc);
        if (updatedInfo.modifiedCount > 0) {
          res.json({
            result: true,
            message: 'Payment Successful'
          })
        }
      }
    })

    app.get("/all-recipe", async (req, res) => {
      const result = await recipesCollection.find().toArray();
      res.send(result)
    })

    app.put("/purchase-recipe", async (req, res) => {
      const body = req.body;
      const id = body.recipeId;
      const userQuery = { email: body.email };
      const creatorQuery = { email: body.creator };
      const recipeQuery = { _id: new ObjectId(id) };
      const userInfo = await usersCollection.findOne(userQuery);
      const creatorInfo = await usersCollection.findOne(creatorQuery);

      const feedbackBody = {
        email: body.email
      }

      const updatedUserCoin = userInfo.coin - 10;
      const setUpdatedUserCoin = {
        $set: {
          coin: updatedUserCoin,
        },
      };

      const updatedCreatorCoin = creatorInfo.coin + 1;
      const setUpdatedCreatorCoin = {
        $set: {
          coin: updatedCreatorCoin,
        },
      };

      const updateRecipeInfo = {
        $push: {
          purchased: feedbackBody,
        },
        $inc: {
          watchCount: 1,
        },
      };

      const updateUserCoinResult = await usersCollection.updateOne(userQuery, setUpdatedUserCoin)
      if (updateUserCoinResult.modifiedCount > 0) {
        const setUpdatedCreatorCoinResult = await usersCollection.updateOne(creatorQuery, setUpdatedCreatorCoin)
        if (setUpdatedCreatorCoinResult.modifiedCount > 0) {
          const updateRecipeInfoResult = await recipesCollection.updateOne(
            recipeQuery,
            updateRecipeInfo
          );
          if (updateRecipeInfoResult.modifiedCount > 0) {
            res.json({
              result: true,
              message: "Successfully Purchased"
            });
          }
        }
      }
    })

    app.get("/recipe/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await recipesCollection.findOne(query);
      if (result._id) {
        res.json({
          result: true,
          data: result
        })
      }
    })

    app.get("/recipe-purchaser/:email/:recipeId", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const recipeId = req.params.recipeId;
      const query = { _id: new ObjectId(recipeId) };
      const recipeInfo = await recipesCollection.findOne(query);
      const react = recipeInfo.react
      let findReact = false;

      for (let i = 0; i < react.length; i++) {
        let reactEmail = react[i].email;
        if (reactEmail == email) {
          findReact = true;
          break;
        }
      }

      res.json({
        react: findReact
      })
    });

    app.put("/recipe-react/:id", verifyJwt, async (req, res) => {
      const body = req.body;
      const id = req.params.id;
      console.log(id);
      console.log(body);
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };

      const reactBody = {
        email: body.email
      }

      const giveLike = {
        $push: {
          react: reactBody,
        },
      };
      const giveUnLike = {
        $pull: {
          react: reactBody,
        },
      };
      let result;

      if (body.react) {
        result = await recipesCollection.updateOne(query, giveUnLike, options);
      } else {
        result = await recipesCollection.updateOne(query, giveLike, options);
      }
      console.log(result);
      if (result.modifiedCount > 0) {
        res.json({
          result: true
        })
      }
    })

    app.get("/purchaser-name/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const recipeInfo = await recipesCollection.findOne({ _id: new ObjectId(id) });
      const result = []

      const purchased = recipeInfo.purchased;
      for (let i = 0; i < purchased.length; i++) {
        let purchaserEmail = purchased[i].email;
        const userInfo = await usersCollection.findOne({ email: purchaserEmail });
        result.push(userInfo.name)
      }

      res.json({
        result: true,
        data: result
      })
    })

    app.get("/recipe-same-category/:id", async (req, res) => {
      const id = req.params.id;
      const recipeInfo = await recipesCollection.findOne({_id : new ObjectId(id)})
      const allRecipe = await recipesCollection.find({ category: recipeInfo.category }).toArray();
      const result = allRecipe.filter(recipe => recipe._id != id)
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Running");
});

app.listen(port, () => {
  console.log(`App is running or Port ${port}`);
});
