export default function camelCaseToSentenceCase(str:string) {
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
