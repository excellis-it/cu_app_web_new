export function camelCaseToSentenceCase(str:string) {
  if (!str) return str;
  // Insert a space before all caps, except the first letter
  const result = str.replace(/([A-Z])/g, ' $1');
  // Split the string into an array of words
  const words = result.split(' ');
  // Capitalize each word
  const capitalizedWords = words.map((word:string) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  // Join the words back into a sentence
  return capitalizedWords.join(' ');
}

export function kebabCaseToSentenceCase(snakeCaseString:string):string {
  // Split the kebab-case string into words
  if(!snakeCaseString) return snakeCaseString;
  var words = snakeCaseString.split('-');

  // Capitalize the first letter of each word
  var capitalizedWords = words.map(function(word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Join the words back together into a sentence
  var sentenceCaseString = capitalizedWords.join(' ');

  return sentenceCaseString;
}
