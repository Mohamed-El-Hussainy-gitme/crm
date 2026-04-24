type CompanyLike = {
  deals: Array<{ amount: number | null }>;
};

export function serializeCompanyListItem<T extends CompanyLike>(company: T) {
  return {
    ...company,
    openPipelineValue: company.deals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0),
  };
}
