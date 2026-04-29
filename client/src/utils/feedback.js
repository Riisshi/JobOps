export const getApiErrorMessage = (error, fallback = "Something went wrong.") => {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.msg ||
    error?.message ||
    fallback
  );
};
