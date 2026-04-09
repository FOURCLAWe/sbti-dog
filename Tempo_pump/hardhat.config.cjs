try {
  require("@nomicfoundation/hardhat-toolbox");
} catch (error) {
  console.warn("[hardhat] hardhat-toolbox unavailable, using bare Hardhat config.");
}
require("dotenv").config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    tempo: {
      type: "http",
      url: "https://rpc.tempo.xyz",
      chainId: 4217,
      accounts
    },
    bsc: {
      type: "http",
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      accounts
    },
    bscTestnet: {
      type: "http",
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts
    }
  }
};
