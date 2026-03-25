'use client';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Input, Button,  Title,  Password   } from 'rizzui';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import FormGroup from '@/app/shared/form-group';
import UploadZone from '@/components/file-upload/upload-zone';
import useApi from '@/hooks/useApi';
import { useRouter } from 'next/navigation';

export default function SiteSettings() {
  const router = useRouter();
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false); 
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const { formState, setError } = useForm<any>(); 
  const initialValues = useApi(`/api/admin/site/get-site-details`, {}, 'GET');
  const onSubmit: SubmitHandler<any> = async (data: any) => {
    const formData = new FormData();

    if (selectedLogo && typeof selectedLogo !== 'string') {
      formData.append('siteLogo', selectedLogo);
    }
    if (selectedImage && typeof selectedImage !== 'string') {
      formData.append('siteMainImage', selectedImage);
    }
    formData.append('siteName', data.siteName);
    formData.append('siteDescription', data.siteDescription);

    setLoading(true);
    try {
      // const data:any = { success: true, message: 'Group Updated successfully', error: { code: 10000, message: 'Group Updated successfully', field: 'name' } }
      let { data, success } = await callApi('/api/admin/site/update-site-details', formData, 'POST', { "content-type": "multipart/form-data" });
      if (data.success) {
        toast.success('Profile Updated successfully');
      } else {
        if (data?.error?.code > 10000) {
          setError(data.error.field, {
            type: 'manual',
            message: data.error.message,
          });
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    }
    setLoading(false);
  };
  return (
    <>
        <Form<any>
          resetValues={reset}
          onSubmit={onSubmit}
        //   validationSchema={editSiteSchema}
        useFormProps={{
            defaultValues: initialValues?.data?.data, // Pass initialValues directly here
          }}
          className="grid grid-cols-1 gap-6 p-6 @container md:grid-cols-2 [&_.rizzui-input-label]:font-medium [&_.rizzui-input-label]:text-gray-900"
        >
          {({ register, getValues, setValue, formState: { errors } }) => {
            return (
              <>
                <div className="col-span-full flex items-center justify-between" >
                  <Title as="h4" className="font-semibold">
                    Edit User
                  </Title>
                 
                </div>
                <Input
                  label="Site Name"
                  placeholder="Enter Site name"
                  {...register('siteName')}
                  defaultValue={initialValues?.data?.data?.siteName}
                  className="col-span-full"
                //   error={errors.name?.message || formState.errors.name?.message}
                />
                <Input
                  label="Site Description"
                  placeholder="Enter Site Description"
                  {...register('siteDescription')}
                  defaultValue={initialValues?.data?.data?.siteDescription}
                  className="col-span-full"
                //   error={errors.userName?.message || formState.errors.userName?.message}
                />

                <FormGroup
                  title="Logo"
                  description="Add Logo here"
                  className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11 col-span-full"
                >
                  <div className="mb-5 @3xl:col-span-2">
                    <UploadZone
                      name="image"
                      getValues={getValues}
                      setValue={setValue}
                      onChange={(file: File) => setSelectedLogo(file)}
                      defaultValue={initialValues?.data?.data?.siteLogo}

                    />
                  </div>
                </FormGroup>
                <FormGroup
                  title="Image"
                  description="Add Image here"
                  className="pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11 col-span-full"
                >
                  <div className="mb-5 @3xl:col-span-2">
                    <UploadZone
                      name="image"
                      getValues={getValues}
                      setValue={setValue}
                      onChange={(file: File) => setSelectedImage(file)}
                      defaultValue={initialValues?.data?.data?.siteMainImage}
                    />
                  </div>
                </FormGroup>
                <div className="col-span-full flex items-center justify-end gap-4" onClick={() => router.push('/')}>
                  <Button
                    variant="outline"
                    className="w-full @xl:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="w-full @xl:w-auto"
                  >
                    Update Profile
                  </Button>
                </div>
              </>
            );
          }}
        </Form>
      
    </>
  );
}