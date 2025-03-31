const webpack = require('webpack');

module.exports = {
    webpack: {
        configure: {
            resolve: {
                fallback: {
                    "crypto": false,
                    "buffer": false,
                    "stream": false
                }
            }
        }
    }
} 