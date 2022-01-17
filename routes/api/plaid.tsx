
const express = require("express");
const plaid = require("plaid");
//app.use(express.json());
const router = express.Router();
const passport = require("passport");
const moment = require("moment");
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

// Load Account and User models
const Account = require("../../models/Account");
const User = require("../../models/User");

const configuration = new Configuration({
  basePath: PlaidEnvironments["sandbox"],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': "6166d89a162e690010d7084b",
      'PLAID-SECRET': "9097d5e53b34172035a9cbf66e1047",
    },
  },
});

const client = new PlaidApi(configuration);
const RandomId = () => {
  return (Math.floor((Math.random() * 10000) + 1)).toString();
}
router.post('/create_link_token', async function (request, response) {
  // Get the client_user_id by searching for the current user
  // const user = await User.find(...); mongodb field _id unique
  //const clientUserId = user.id; logged in user k liye key  db email pwd + id
  const request1 = {
    user: {
      // This should correspond to a unique id for the current user.
      client_user_id: RandomId(),
    },
    client_name: 'Plaid Test App',
    products: ["auth"],
    language: 'en',
    country_codes: ['us']
  };
  try {
    
    const createTokenResponse = await client.linkTokenCreate(request1);
    await console.log("sa");
    await response.json(createTokenResponse.data);
  } catch (error) {
    // handle error
    console.log(error.data);
  }
});

var PUBLIC_TOKEN = null;
var ACCESS_TOKEN = null;
var ITEM_ID = null;

// @route GET api/plaid/accounts
// @desc Get all accounts linked with plaid for a specific user
// @access Private
router.get(
  "/accounts",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Account.find({ userId: req.user.id })
      .then(accounts => res.json(accounts))
      .catch(err => console.log(err));
  }
);

// @route POST api/plaid/accounts/add
// @desc Trades public token for access token and stores credentials in database
// @access Private
router.post(
  "/accounts/add",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    PUBLIC_TOKEN = req.body.public_token;

    const userId = req.user.id;
    const institution = req.body.metadata.institution;
    const { name, institution_id } = institution;
    
    const publicToken = req.body.public_token;
    try {
      
      const request = {
        public_token: publicToken,
      } ;
      const response = await client.itemPublicTokenExchange(request);
      ACCESS_TOKEN = await response.data.access_token;
      ITEM_ID = await response.data.item_id;
      const mungu = async () => {
        if(PUBLIC_TOKEN){
       Account.findOne({
             userId: req.user.id,
             institutionId: institution_id
       })
       .then(account => {
              if (account) {
                console.log("Account already exists");
              } else {
                const newAccount = new Account({
                  userId: userId,
                  accessToken: ACCESS_TOKEN,
                  itemId: ITEM_ID,
                  institutionId: institution_id,
                  institutionName: name
                });

                newAccount.save().then(account => res.json(account));
              }
            })
            .catch((err) => {console.log("wow",err)}); // Mongo Error
        }
        
      }
      await mungu();
    } catch (error) {
      // handle error
      console.log("acces token exchange erro");
    }
  });
    
     
    
    // if (PUBLIC_TOKEN) {
    //   client
    //     .exchangePublicToken(PUBLIC_TOKEN) exchanging public token to access
    //     .then(exchangeResponse => {
    //       ACCESS_TOKEN = exchangeResponse.access_token; // res gives access token
    //       ITEM_ID = exchangeResponse.item_id;

    //       // Check if account already exists for specific user
    //       Account.findOne({
    //         userId: req.user.id,
    //         institutionId: institution_id
    //       })
    //         .then(account => {
    //           if (account) {
    //             console.log("Account already exists");
    //           } else {
    //             const newAccount = new Account({
    //               userId: userId,
    //               accessToken: ACCESS_TOKEN,
    //               itemId: ITEM_ID,
    //               institutionId: institution_id,
    //               institutionName: name
    //             });

    //             newAccount.save().then(account => res.json(account));
    //           }
    //         })
    //         .catch(err => console.log(err)); // Mongo Error
    //     })
    //     .catch(err => console.log(err)); // Plaid Error
    // }
  


// @route DELETE api/plaid/accounts/:id
// @desc Delete account with given id
// @access Private
router.delete(
  "/accounts/:id",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Account.findById(req.params.id).then(account => {
      // Delete account
      account.remove().then(() => res.json({ success: true }));
    });
  }
);

// @route POST api/plaid/accounts/transactions
// @desc Fetch transactions from past 30 days from all linked accounts
// @access Private
router.post(
  "/accounts/transactions",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    const now = moment();
    const today = now.format("YYYY-MM-DD");
    const thirtyDaysAgo = now.subtract(30, "days").format("YYYY-MM-DD");

    let transactions = [];

    const accounts = req.body;

    if (accounts) {
      accounts.forEach(function(account) {
        ACCESS_TOKEN = account.accessToken;
        const institutionName = account.institutionName;

        client
          .getTransactions(ACCESS_TOKEN, thirtyDaysAgo, today)
          .then(response => {
            transactions.push({
              accountName: institutionName,
              transactions: response.transactions
            });

            if (transactions.length === accounts.length) {
              res.json(transactions);
            }
          })
          .catch(err => console.log(err));
      });
    }
  }
);

module.exports = router;
