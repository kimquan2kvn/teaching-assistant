import { apiSlice } from './api-slice';

export const conductCatalogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConductCatalog: builder.query({
      query: () => '/conduct-catalog',
      providesTags: ['ConductCatalog'],
    }),
    createConductCatalogItem: builder.mutation({
      query: (body) => ({ url: '/conduct-catalog', method: 'POST', body }),
      invalidatesTags: ['ConductCatalog'],
    }),
    updateConductCatalogItem: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/conduct-catalog/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ConductCatalog'],
    }),
  }),
});

export const {
  useGetConductCatalogQuery,
  useCreateConductCatalogItemMutation,
  useUpdateConductCatalogItemMutation,
} = conductCatalogApi;
