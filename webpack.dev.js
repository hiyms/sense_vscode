//@ts-check
'use strict';

const { merge } = require('webpack-merge');
const baseConfig = require('./webpack.config.js');

/**@type {import('webpack').Configuration}*/
const devConfig = merge(baseConfig, {
    mode: 'development',
    devtool: 'source-map',
    optimization: {
        minimize: false
    }
});

module.exports = devConfig;
