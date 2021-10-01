// /* global task*/
require("@nomiclabs/hardhat-ethers")

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

const fs = require('fs')
const accounts = JSON.parse(fs.readFileSync('.accounts'))

module.exports = {
  solidity: {
    version:  '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs:    10000
      }
    }
  },
  networks: {
    hardhat: { hardfork: 'berlin' },
    polygon:  {
      url:        process.env.POLYGON_URL || '',
      network_id: 137,
      accounts: accounts
    },
    mumbai:  {
      url:           process.env.POLYGON_URL || 'https://rpc-mumbai.maticvigil.com',
      accounts:      accounts,
      network_id:    80001,
      gas:           5500000
      // confirmations: 2,
      // timeoutBlocks: 200,
      // skipDryRun:    true
    },
    kovan: {
      url:      process.env.KOVAN_URL || '',
      accounts: accounts
    },
    ropsten: {
      url:      process.env.ROPSTEN_URL || '',
      accounts: accounts
    },
    rinkeby: {
      url:      process.env.RINKEBY_URL || '',
      accounts: accounts,
      gasPrice: 1.5e9
    },
    arbrinkeby: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      accounts: accounts
    }
  }
}
