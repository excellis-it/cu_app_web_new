'use client';
import { useEffect, useRef, useState } from 'react';
import { PiXBold } from 'react-icons/pi';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Input, Button, ActionIcon, Title, Text, SelectOption } from 'rizzui';
import { useModal } from '@/app/shared/modal-views/use-modal';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import FormGroup from '@/app/shared/form-group';
import UploadZone from '@/components/file-upload/upload-zone';
import {
  CreateGroupInput,
  createGroupSchema,
} from '@/utils/validators/create-group.schema';
import useApi from '@/hooks/useApi';
import { User, UserOption } from '@/types';
import Select from 'react-select';
import { io, Socket } from 'socket.io-client';

export default function EditGroup({
  refresh = () => {},
  id,
}: {
  refresh: Function;
  id: string;
}) {
  const { closeModal } = useModal();
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false);
  const [members, setMembers] = useState<UserOption[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<UserOption[]>([]);
  const { formState, setError } = useForm<CreateGroupInput>();
  const socketRef = useRef<Socket | null>(null); // Moved inside the component body

  const {
    data: { data: initialValues },
    refresh: refreshGroup,
  } = useApi(`/api/groups/get-group-details?id=${id}`, {}, 'GET');


  //socket connection
  useEffect(() => {

    // Initialize the socket connection
    socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL as string);

  }, []);

  const {
    data: { data :users},
    error,
    refresh: refreshUsers,
  } = useApi('/api/admin/users/all-users', {}, 'POST');

  useEffect(() => {
    if (initialValues?._id) {
      Array.isArray(initialValues.currentUsers)
        ? setSelectedMembers([
            ...initialValues.currentUsers?.map((el: User) => ({
              ...el,
              label: el.name,
              value: el._id,
            })),
          ])
        : setSelectedMembers([]);
    }
  }, [initialValues]);

  useEffect(() => {
    if (Array.isArray(users)) {
      var members_: UserOption[] = users.map((user: any) => ({
        ...user,
        label: user.name,
        value: user._id,
      }));
      setMembers(members_);
    }
  }, [users]);


  const onSubmit: SubmitHandler<CreateGroupInput> = async (data: any) => {
    const formData = new FormData();

    formData.append('groupId', initialValues._id);
    if (selectedImage && typeof selectedImage !== 'string') {
      formData.append('file', selectedImage);
    }
    formData.append('groupName', data.groupName);
    formData.append('groupDescription', data.groupDescription);
    formData.append('groupImage', data.groupImage);

    formData.append(
      'users',
      JSON.stringify(selectedMembers?.map((el) => el.value))
    );
    setLoading(true);
    try {
      let { data, success } = await callApi(
        '/api/admin/groups/update',
        formData,
        'POST',
        { 'content-type': 'multipart/form-data' }
      );

      if (data.success) {
        toast.success('Group Updated successfully');
        socketRef?.current?.emit('update-group', data);
        socketRef?.current?.emit('addremoveuser', data.data);
        closeModal();
        refresh();
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
      {initialValues?._id && (
        <Form<CreateGroupInput>
          resetValues={reset}
          onSubmit={onSubmit}
          validationSchema={createGroupSchema}
          useFormProps={{
            defaultValues: initialValues,
          }}
          className="grid grid-cols-1 gap-6 p-6 @container md:grid-cols-2 [&_.rizzui-input-label]:font-medium [&_.rizzui-input-label]:text-gray-900"
        >
          {({
            register,
            setError,
            control,
            watch,
            getValues,
            setValue,
            formState: { errors },
          }) => {
            return (
              <>
                <div className="col-span-full flex items-center justify-between">
                  <Title as="h4" className="font-semibold">
                    Edit Group
                  </Title>
                  <ActionIcon size="sm" variant="text" onClick={closeModal}>
                    <PiXBold className="h-auto w-5" />
                  </ActionIcon>
                </div>
                <Input
                  label="Group Name"
                  placeholder="Enter a Group Name"
                  {...register('groupName')}
                  className="col-span-full"
                  error={
                    errors.groupName?.message ||
                    formState.errors.groupName?.message
                  }
                />
                <Input
                  label="Group Description"
                  placeholder="Enter a Group Description"
                  {...register('groupDescription')}
                  className="col-span-full"
                  error={
                    errors.groupName?.message ||
                    formState.errors.groupName?.message
                  }
                />
                {Array.isArray(members) && (
                  <Controller
                    name="members"
                    control={control}
                    render={({ field: { onChange, value } }) => (
                      <div
                        className={`${errors?.members && 'is-invalid'} z-100 col-span-full`}
                      >
                        <label className="\[\&_\ rizzui-input-label\]\ rizzui-input-label z-50 text-gray-900">
                          Select Group Members
                        </label>
                        <Select
                          isMulti={true}
                          options={members}
                          placeholder="Edit Members"
                          value={selectedMembers}
                          onChange={(values: any) => {
                            setSelectedMembers([...values]);
                            onchange && onChange(values);
                          }}
                          className="z-50"
                        />
                        <p className="text-red-600">
                          {errors?.members?.message?.toString()}
                        </p>
                      </div>
                    )}
                  />
                )}

                <FormGroup
                  title="Group Image"
                  description="Add a Group Image here"
                  className="col-span-full pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
                >
                  <div className="mb-5 @3xl:col-span-2">
                    <UploadZone
                      name="groupImage"
                      getValues={getValues}
                      setValue={setValue}
                      error={errors?.groupImage?.message as string}
                      onChange={(file: File) => setSelectedImage(file)}
                      defaultValue={initialValues?.groupImage !== 'undefined'?initialValues?.groupImage:''} // Pass the default image URL here
                    />
                  </div>
                </FormGroup>
                <div className="col-span-full flex items-center justify-end gap-4">
                  <Button
                    variant="outline"
                    onClick={closeModal}
                    className="w-full @xl:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="w-full @xl:w-auto"
                  >
                    Update Group
                  </Button>
                </div>
              </>
            );
          }}
        </Form>
      )}
    </>
  );
}
