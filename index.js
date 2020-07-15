"use strict";
const path = require("path");
const chalk = require("chalk");
const logSymbols = require("log-symbols");
const plur = require("plur");
const stringWidth = require("string-width");
const ansiEscapes = require("ansi-escapes");
const { supportsHyperlink } = require("supports-hyperlinks");
const getRuleDocs = require("eslint-rule-docs");

module.exports = (results, data) => {
	const lines = [];
	let errorCount = 0;
	let warningCount = 0;
	let maxLineWidth = 0;
	let maxColumnWidth = 0;
	let maxMessageWidth = 0;
	let showLineNumbers = false;
	let maxRuleWidth = 0;
	let summary = {};

	results
		.sort((a, b) => {
			if (a.errorCount === b.errorCount) {
				return b.warningCount - a.warningCount;
			}

			if (a.errorCount === 0) {
				return -1;
			}

			if (b.errorCount === 0) {
				return 1;
			}

			return b.errorCount - a.errorCount;
		})
		.forEach((result) => {
			const { messages, filePath } = result;

			if (messages.length === 0) {
				return;
			}

			warningCount += result.warningCount;

			if (lines.length !== 0) {
				lines.push({ type: "separator" });
			}

			const firstErrorOrWarning =
				messages.find(({ severity }) => severity === 2) || messages[0];

			const trueErrorCount = messages.filter((x) => {
				return x.fatal || x.severity === 2 || x.severity === "error";
			}).length;

			errorCount += trueErrorCount;

			if (trueErrorCount > 0) {
				lines.push({
					type: "header",
					filePath,
					relativeFilePath: path.relative(".", filePath),
					firstLineCol:
						firstErrorOrWarning.line + ":" + firstErrorOrWarning.column,
				});
			}

			messages
				.sort((a, b) => {
					if (a.fatal === b.fatal && a.severity === b.severity) {
						if (a.line === b.line) {
							return a.column < b.column ? -1 : 1;
						}

						return a.line < b.line ? -1 : 1;
					}

					if ((a.fatal || a.severity === 2) && (!b.fatal || b.severity !== 2)) {
						return 1;
					}

					return -1;
				})
				.forEach((x) => {
					let { message } = x;

					// Stylize inline code blocks
					message = message.replace(/\B`(.*?)`\B|\B'(.*?)'\B/g, (m, p1, p2) =>
						chalk.bold(p1 || p2)
					);

					const line = String(x.line || 0);
					const column = String(x.column || 0);
					const lineWidth = stringWidth(line);
					const columnWidth = stringWidth(column);
					const messageWidth = stringWidth(message);
					const ruleWidth = stringWidth(x.ruleId);

					maxLineWidth = Math.max(lineWidth, maxLineWidth);
					maxColumnWidth = Math.max(columnWidth, maxColumnWidth);
					maxMessageWidth = Math.max(messageWidth, maxMessageWidth);
					maxRuleWidth = Math.max(ruleWidth, maxRuleWidth);
					showLineNumbers = showLineNumbers || x.line || x.column;

					const isError = x.fatal || x.severity === 2 || x.severity === "error";

					if (isError) {
						lines.push({
							type: "message",
							severity: isError ? "error" : "warning",
							line,
							lineWidth,
							column,
							columnWidth,
							message,
							messageWidth,
							ruleId: x.ruleId || "",
						});
					} else {
						if (!summary[x.ruleId]) summary[x.ruleId] = { nr: 0, files: [] };
						summary[x.ruleId].nr++;
						if (summary[x.ruleId].files.indexOf(result.filePath) == -1)
							summary[x.ruleId].files.push(result.filePath);
					}
				});
		});

	let output = "\n";

	if (process.stdout.isTTY && !process.env.CI) {
		// Make relative paths Command-clickable in iTerm
		output += ansiEscapes.iTerm.setCwd();
	}

	if (Object.keys(summary).length > 0) {
		output += "  " + chalk.blue("Warning summary") + "\n";
		Object.keys(summary).forEach((ruleId) => {
			output +=
				"  " +
				chalk.gray(ruleId) +
				" ".repeat(maxRuleWidth - ruleId.length) +
				"  " +
				chalk.yellow(summary[ruleId].nr) +
				" errors in " +
				chalk.yellow(summary[ruleId].files.length) +
				" files" +
				"\n";
		});
		output += "\n";
	}

	if (errorCount > 0) {
		output += "  " + chalk.blue("Error details") + "\n";

		output +=
			lines
				.map((x) => {
					if (x.type === "header") {
						// Add the line number so it's Command-click'able in some terminals
						// Use dim & gray for terminals like iTerm that doesn't support `hidden`
						const position = showLineNumbers
							? chalk.hidden.dim.gray(`:${x.firstLineCol}`)
							: "";

						return "  " + chalk.underline(x.relativeFilePath) + position;
					}

					if (x.type === "message") {
						let ruleUrl;

						try {
							ruleUrl = data.rulesMeta[x.ruleId].docs.url;
						} catch {
							try {
								ruleUrl = getRuleDocs(x.ruleId).url;
							} catch {}
						}

						const line = [
							"",
							x.severity === "warning" ? "warning" : "error",
							" ".repeat(maxLineWidth - x.lineWidth) +
								chalk.dim(x.line + chalk.gray(":") + x.column),
							" ".repeat(maxColumnWidth - x.columnWidth) + x.message,
							" ".repeat(maxMessageWidth - x.messageWidth) +
								(ruleUrl && supportsHyperlink(process.stdout)
									? ansiEscapes.link(chalk.dim(x.ruleId), ruleUrl)
									: chalk.dim(x.ruleId)),
						];

						if (!showLineNumbers) {
							line.splice(2, 1);
						}

						return line.join("  ");
					}

					return "";
				})
				.join("\n") + "\n\n";
	}

	if (warningCount > 0) {
		output +=
			"  " + chalk.yellow(`${warningCount} ${plur("warning", warningCount)}`);
	}

	if (errorCount > 0) {
		output +=
			", " + chalk.red(`${errorCount} ${plur("error", errorCount)}`) + "\n";
	}

	return errorCount + warningCount > 0 ? output : "";
};
