const path = require("path");

module.exports = {
	entry: "./src/index.ts",
	target: "node",
	mode: "production",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "index.js"
	},
	resolve: {
		extensions: [".ts", ".js"]
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: "ts-loader",
				exclude: /node_modules/
			},
			{
				test: /\.node$/,
				loader: "node-loader"
			}
		]
	},
	externals: {
		"node-pty": "commonjs node-pty",
		ws: "commonjs ws"
	}
};
