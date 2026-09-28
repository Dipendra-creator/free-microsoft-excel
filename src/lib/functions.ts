import { FUNCTION_TABLE } from "./functionTable";

export interface FunctionDoc {
  name: string;
  category: string;
  syntax: string;
  description: string;
}

// Syntax + description for commonly used functions. Every other engine
// function still appears in lists with a generic description.
const DOCS: Record<string, [string, string]> = {
  SUM: ["SUM(number1, [number2], ...)", "Adds all the numbers in a range of cells."],
  AVERAGE: ["AVERAGE(number1, [number2], ...)", "Returns the average (arithmetic mean) of its arguments."],
  COUNT: ["COUNT(value1, [value2], ...)", "Counts the number of cells that contain numbers."],
  COUNTA: ["COUNTA(value1, [value2], ...)", "Counts the number of cells that are not empty."],
  COUNTBLANK: ["COUNTBLANK(range)", "Counts the number of empty cells in a range."],
  MAX: ["MAX(number1, [number2], ...)", "Returns the largest value in a set of values."],
  MIN: ["MIN(number1, [number2], ...)", "Returns the smallest value in a set of values."],
  IF: ["IF(logical_test, [value_if_true], [value_if_false])", "Checks whether a condition is met, and returns one value if TRUE, and another value if FALSE."],
  IFS: ["IFS(logical_test1, value_if_true1, ...)", "Checks whether one or more conditions are met and returns a value corresponding to the first TRUE condition."],
  IFERROR: ["IFERROR(value, value_if_error)", "Returns value_if_error if expression is an error and the value of the expression itself otherwise."],
  IFNA: ["IFNA(value, value_if_na)", "Returns the value you specify if the expression resolves to #N/A."],
  AND: ["AND(logical1, [logical2], ...)", "Checks whether all arguments are TRUE."],
  OR: ["OR(logical1, [logical2], ...)", "Checks whether any of the arguments are TRUE."],
  NOT: ["NOT(logical)", "Changes FALSE to TRUE, or TRUE to FALSE."],
  XOR: ["XOR(logical1, [logical2], ...)", "Returns a logical Exclusive Or of all arguments."],
  SWITCH: ["SWITCH(expression, value1, result1, [default_or_value2, result2], ...)", "Evaluates an expression against a list of values and returns the result of the first match."],
  SUMIF: ["SUMIF(range, criteria, [sum_range])", "Adds the cells specified by a given condition or criteria."],
  SUMIFS: ["SUMIFS(sum_range, criteria_range1, criteria1, ...)", "Adds the cells specified by a given set of conditions or criteria."],
  COUNTIF: ["COUNTIF(range, criteria)", "Counts the number of cells within a range that meet the given condition."],
  COUNTIFS: ["COUNTIFS(criteria_range1, criteria1, ...)", "Counts the number of cells specified by a given set of conditions or criteria."],
  AVERAGEIF: ["AVERAGEIF(range, criteria, [average_range])", "Finds the average for the cells specified by a given condition or criteria."],
  AVERAGEIFS: ["AVERAGEIFS(average_range, criteria_range1, criteria1, ...)", "Finds the average for the cells specified by a given set of conditions or criteria."],
  MAXIFS: ["MAXIFS(max_range, criteria_range1, criteria1, ...)", "Returns the maximum value among cells specified by a given set of conditions."],
  MINIFS: ["MINIFS(min_range, criteria_range1, criteria1, ...)", "Returns the minimum value among cells specified by a given set of conditions."],
  SUMPRODUCT: ["SUMPRODUCT(array1, [array2], ...)", "Returns the sum of the products of corresponding ranges or arrays."],
  ROUND: ["ROUND(number, num_digits)", "Rounds a number to a specified number of digits."],
  ROUNDUP: ["ROUNDUP(number, num_digits)", "Rounds a number up, away from zero."],
  ROUNDDOWN: ["ROUNDDOWN(number, num_digits)", "Rounds a number down, toward zero."],
  INT: ["INT(number)", "Rounds a number down to the nearest integer."],
  MOD: ["MOD(number, divisor)", "Returns the remainder after a number is divided by a divisor."],
  ABS: ["ABS(number)", "Returns the absolute value of a number."],
  POWER: ["POWER(number, power)", "Returns the result of a number raised to a power."],
  SQRT: ["SQRT(number)", "Returns the square root of a number."],
  PRODUCT: ["PRODUCT(number1, [number2], ...)", "Multiplies all the numbers given as arguments."],
  RAND: ["RAND()", "Returns a random number greater than or equal to 0 and less than 1."],
  RANDBETWEEN: ["RANDBETWEEN(bottom, top)", "Returns a random number between the numbers you specify."],
  CEILING: ["CEILING(number, significance)", "Rounds a number up to the nearest multiple of significance."],
  FLOOR: ["FLOOR(number, significance)", "Rounds a number down toward zero, to the nearest multiple of significance."],
  PI: ["PI()", "Returns the value of pi, 3.14159265358979."],
  VLOOKUP: ["VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])", "Looks for a value in the leftmost column of a table, and then returns a value in the same row from a column you specify."],
  HLOOKUP: ["HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])", "Looks for a value in the top row of a table and returns the value in the same column from a row you specify."],
  XLOOKUP: ["XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])", "Searches a range or an array for a match and returns the corresponding item from a second range or array."],
  LOOKUP: ["LOOKUP(lookup_value, lookup_vector, [result_vector])", "Looks up a value either from a one-row or one-column range."],
  INDEX: ["INDEX(array, row_num, [column_num])", "Returns a value or reference of the cell at the intersection of a particular row and column, in a given range."],
  MATCH: ["MATCH(lookup_value, lookup_array, [match_type])", "Returns the relative position of an item in an array that matches a specified value in a specified order."],
  XMATCH: ["XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])", "Returns the relative position of an item in an array."],
  CHOOSE: ["CHOOSE(index_num, value1, [value2], ...)", "Chooses a value from a list of values, based on an index number."],
  OFFSET: ["OFFSET(reference, rows, cols, [height], [width])", "Returns a reference to a range that is a given number of rows and columns from a given reference."],
  INDIRECT: ["INDIRECT(ref_text, [a1])", "Returns the reference specified by a text string."],
  ROW: ["ROW([reference])", "Returns the row number of a reference."],
  COLUMN: ["COLUMN([reference])", "Returns the column number of a reference."],
  ROWS: ["ROWS(array)", "Returns the number of rows in a reference or an array."],
  COLUMNS: ["COLUMNS(array)", "Returns the number of columns in an array or reference."],
  FILTER: ["FILTER(array, include, [if_empty])", "Filters a range or array."],
  SORT: ["SORT(array, [sort_index], [sort_order], [by_col])", "Sorts a range or array."],
  UNIQUE: ["UNIQUE(array, [by_col], [exactly_once])", "Returns the unique values from a range or array."],
  SEQUENCE: ["SEQUENCE(rows, [columns], [start], [step])", "Generates a list of sequential numbers in an array."],
  TRANSPOSE: ["TRANSPOSE(array)", "Converts a vertical range of cells to a horizontal range, or vice versa."],
  CONCAT: ["CONCAT(text1, [text2], ...)", "Concatenates a list or range of text strings."],
  CONCATENATE: ["CONCATENATE(text1, [text2], ...)", "Joins several text strings into one text string."],
  TEXTJOIN: ["TEXTJOIN(delimiter, ignore_empty, text1, ...)", "Concatenates a list or range of text strings using a delimiter."],
  LEFT: ["LEFT(text, [num_chars])", "Returns the specified number of characters from the start of a text string."],
  RIGHT: ["RIGHT(text, [num_chars])", "Returns the specified number of characters from the end of a text string."],
  MID: ["MID(text, start_num, num_chars)", "Returns the characters from the middle of a text string, given a starting position and length."],
  LEN: ["LEN(text)", "Returns the number of characters in a text string."],
  LOWER: ["LOWER(text)", "Converts all letters in a text string to lowercase."],
  UPPER: ["UPPER(text)", "Converts a text string to all uppercase letters."],
  PROPER: ["PROPER(text)", "Converts a text string to proper case."],
  TRIM: ["TRIM(text)", "Removes all spaces from a text string except for single spaces between words."],
  TEXT: ["TEXT(value, format_text)", "Converts a value to text in a specific number format."],
  VALUE: ["VALUE(text)", "Converts a text string that represents a number to a number."],
  FIND: ["FIND(find_text, within_text, [start_num])", "Returns the starting position of one text string within another text string (case-sensitive)."],
  SEARCH: ["SEARCH(find_text, within_text, [start_num])", "Returns the number of the character at which a text string is first found (not case-sensitive)."],
  SUBSTITUTE: ["SUBSTITUTE(text, old_text, new_text, [instance_num])", "Replaces existing text with new text in a text string."],
  REPLACE: ["REPLACE(old_text, start_num, num_chars, new_text)", "Replaces part of a text string with a different text string."],
  REPT: ["REPT(text, number_times)", "Repeats text a given number of times."],
  TEXTBEFORE: ["TEXTBEFORE(text, delimiter, [instance_num], ...)", "Returns text that occurs before a given character or string."],
  TEXTAFTER: ["TEXTAFTER(text, delimiter, [instance_num], ...)", "Returns text that occurs after a given character or string."],
  TODAY: ["TODAY()", "Returns the current date formatted as a date."],
  NOW: ["NOW()", "Returns the current date and time formatted as a date and time."],
  DATE: ["DATE(year, month, day)", "Returns the number that represents the date."],
  TIME: ["TIME(hour, minute, second)", "Converts hours, minutes, and seconds given as numbers to a serial number."],
  YEAR: ["YEAR(serial_number)", "Returns the year of a date."],
  MONTH: ["MONTH(serial_number)", "Returns the month, a number from 1 (January) to 12 (December)."],
  DAY: ["DAY(serial_number)", "Returns the day of the month, a number from 1 to 31."],
  WEEKDAY: ["WEEKDAY(serial_number, [return_type])", "Returns a number from 1 to 7 identifying the day of the week of a date."],
  WEEKNUM: ["WEEKNUM(serial_number, [return_type])", "Returns the week number in the year."],
  EDATE: ["EDATE(start_date, months)", "Returns the serial number of the date that is the indicated number of months before or after the start date."],
  EOMONTH: ["EOMONTH(start_date, months)", "Returns the serial number of the last day of the month before or after a specified number of months."],
  DATEDIF: ["DATEDIF(start_date, end_date, unit)", "Calculates the number of days, months, or years between two dates."],
  NETWORKDAYS: ["NETWORKDAYS(start_date, end_date, [holidays])", "Returns the number of whole workdays between two dates."],
  WORKDAY: ["WORKDAY(start_date, days, [holidays])", "Returns the serial number of the date before or after a specified number of workdays."],
  DAYS: ["DAYS(end_date, start_date)", "Returns the number of days between the two dates."],
  PMT: ["PMT(rate, nper, pv, [fv], [type])", "Calculates the payment for a loan based on constant payments and a constant interest rate."],
  IPMT: ["IPMT(rate, per, nper, pv, [fv], [type])", "Returns the interest payment for a given period for an investment."],
  PPMT: ["PPMT(rate, per, nper, pv, [fv], [type])", "Returns the payment on the principal for a given investment."],
  FV: ["FV(rate, nper, pmt, [pv], [type])", "Returns the future value of an investment."],
  PV: ["PV(rate, nper, pmt, [fv], [type])", "Returns the present value of an investment."],
  NPV: ["NPV(rate, value1, [value2], ...)", "Returns the net present value of an investment based on a discount rate and future cash flows."],
  IRR: ["IRR(values, [guess])", "Returns the internal rate of return for a series of cash flows."],
  RATE: ["RATE(nper, pmt, pv, [fv], [type], [guess])", "Returns the interest rate per period of a loan or an annuity."],
  NPER: ["NPER(rate, pmt, pv, [fv], [type])", "Returns the number of periods for an investment."],
  MEDIAN: ["MEDIAN(number1, [number2], ...)", "Returns the median, or the number in the middle of the set of given numbers."],
  MODE: ["MODE(number1, [number2], ...)", "Returns the most frequently occurring value in a range of data."],
  "STDEV.S": ["STDEV.S(number1, [number2], ...)", "Estimates standard deviation based on a sample."],
  "STDEV.P": ["STDEV.P(number1, [number2], ...)", "Calculates standard deviation based on the entire population."],
  LARGE: ["LARGE(array, k)", "Returns the k-th largest value in a data set."],
  SMALL: ["SMALL(array, k)", "Returns the k-th smallest value in a data set."],
  RANK: ["RANK(number, ref, [order])", "Returns the rank of a number in a list of numbers."],
  SUBTOTAL: ["SUBTOTAL(function_num, ref1, [ref2], ...)", "Returns a subtotal in a list or database."],
  ISBLANK: ["ISBLANK(value)", "Checks whether a reference is to an empty cell."],
  ISNUMBER: ["ISNUMBER(value)", "Checks whether a value is a number."],
  ISTEXT: ["ISTEXT(value)", "Checks whether a value is text."],
  ISERROR: ["ISERROR(value)", "Checks whether a value is an error."],
  LET: ["LET(name1, name_value1, calculation_or_name2, ...)", "Assigns names to calculation results to allow storing intermediate calculations."],
  LAMBDA: ["LAMBDA([parameter1, parameter2, ...], calculation)", "Creates a custom, reusable function."],
};

export const CATEGORIES = [
  "Financial",
  "Logical",
  "Text",
  "Date & Time",
  "Lookup & Reference",
  "Math & Trig",
  "Statistical",
  "Engineering",
  "Information",
  "Database",
  "Compatibility",
];

export const FUNCTIONS: FunctionDoc[] = FUNCTION_TABLE.map(([name, category]) => {
  const doc = DOCS[name];
  return {
    name,
    category,
    syntax: doc ? doc[0] : `${name}(...)`,
    description: doc ? doc[1] : `${category} function.`,
  };
});

const byName = new Map(FUNCTIONS.map((f) => [f.name, f]));

export function functionDoc(name: string): FunctionDoc | undefined {
  return byName.get(name.toUpperCase());
}

export function searchFunctions(prefix: string, limit = 12): FunctionDoc[] {
  const p = prefix.toUpperCase();
  if (!p) return [];
  const starts = FUNCTIONS.filter((f) => f.name.startsWith(p));
  starts.sort((a, b) => {
    const ad = DOCS[a.name] ? 0 : 1;
    const bd = DOCS[b.name] ? 0 : 1;
    return ad - bd || a.name.length - b.name.length || a.name.localeCompare(b.name);
  });
  return starts.slice(0, limit);
}

export const MOST_USED = ["SUM", "AVERAGE", "IF", "COUNT", "MAX", "MIN", "VLOOKUP", "XLOOKUP", "SUMIF", "COUNTIF", "IFERROR", "CONCAT", "TODAY", "ROUND"];

/** Splits a syntax string into [prefix, args[], suffix] to bold the active argument. */
export function syntaxParts(syntax: string): { name: string; args: string[] } {
  const open = syntax.indexOf("(");
  const name = syntax.slice(0, open);
  const inner = syntax.slice(open + 1, syntax.lastIndexOf(")"));
  const args = inner ? inner.split(/,\s*/) : [];
  return { name, args };
}
