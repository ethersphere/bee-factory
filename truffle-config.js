module.exports = {

  networks: {
    development: {
      host: "127.0.0.1",
      port: 9545,
      network_id: "4020",
      gasPrice: "10000000000", //10 gwei
    }
  },

  compilers: {
    solc: {
      version: "0.8.0",    // Fetch exact version from solc-bin (default: truffle's version)
      docker: true,
    }
  },

  db: {
    enabled: true
  }
};
