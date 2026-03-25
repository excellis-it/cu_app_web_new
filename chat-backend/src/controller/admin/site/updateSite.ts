import SiteSettings from "../../../db/schemas/site-settings.schema";
import { upload } from "../../../helpers/upload";

export async function getSiteDetails() {
  try {

    const currentSettings = await SiteSettings.find({})
    if (currentSettings.length === 0) {
      return {}
    } else return currentSettings[0]

  } catch (error) {
    console.log(error); // get error log on your console
    throw error;
  }
}

export async function updateSite(data: any, logoFile: any, imageFile: any) {
  try {
    let updateQuery: any = {}
    if (data.siteName) updateQuery.siteName = data.siteName
    if (data.siteDescription) updateQuery.siteDescription = data.siteDescription
    if (data.primaryColor) updateQuery.primaryColor = data.primaryColor
    if (data.secondaryColor) updateQuery.secondaryColor = data.secondaryColor
    if (data.accentColor) updateQuery.accentColor = data.accentColor
    if (data.backgroundColor) updateQuery.backgroundColor = data.backgroundColor
    if (logoFile) {
      let imageURL = await upload(logoFile)
      // let imageURL = `https://extalkapi.excellisit.net/uploads/site/${logoFile.filename}`

      updateQuery.siteLogo = imageURL
    }
    if (imageFile) {
      let imageURL = await upload(imageFile)
      // let imageURL = `https://extalkapi.excellisit.net/uploads/site/${imageFile.filename}`

      updateQuery.siteMainImage = imageURL
    }
    const currentSettings = await SiteSettings.find({})
    if (currentSettings.length === 0) {
      const newSettings = await SiteSettings.create(updateQuery)
      return newSettings
    } else {
      const updated = await SiteSettings.findByIdAndUpdate(
        currentSettings[0]._id,
        { $set: updateQuery },
        { new: true }
      );
      return updated
    }
  } catch (error) {
    console.log(error);// get error print on your console
    throw error;
  }
}