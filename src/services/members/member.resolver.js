import { searchMembersRepository } from "../../repositories/members/member.repository.js";

const mapMember = (member) => ({
  documentNumber: String(member.COD_SOCIO),
  fullName: member.NOMBRE_COMPLETO,
  category: member.CATEGORIA,
  active: member.ACTIVO === "S",
  similarity: Number(member.SIMILARITY ?? 0),
});

export const resolveMember = async (search, connection) => {
  const members = await searchMembersRepository(connection, search);
  if(members?.candidateTruncated&&!members.length)return {status:'AMBIGUOUS',query:search,options:[],totalMatches:null,returnedMatches:0,hasMore:true,reason:'SEARCH_CANDIDATE_LIMIT_REACHED'};

  if (!members || members.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  const first = members[0];
  const totalMatches=Number(first.TOTAL_MATCHES??members.length);
  const truncated=totalMatches>members.length||members.some(m=>m.CANDIDATES_TRUNCATED===true);
  const metadata={totalMatches:first.CANDIDATES_TRUNCATED?null:totalMatches,returnedMatches:members.length,hasMore:truncated};

  if (Number(first.MATCH_PRIORITY) === 1 && totalMatches === 1 && !truncated) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  if (Number(first.MATCH_PRIORITY) === 2 && !truncated) {
    if (members.length === 1) {
      return {
        status: "RESOLVED",
        member: mapMember(first),
      };
    }

    const second = members[1];
    const scoreDifference =
      Number(first.SIMILARITY) - Number(second.SIMILARITY);

    if (Number(first.SIMILARITY) >= 95 && scoreDifference >= 5) {
      return {
        status: "RESOLVED",
        member: mapMember(first),
      };
    }
  }

  if (members.length === 1 && !truncated && Number(first.MATCH_PRIORITY)!==1) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  const second = members[1];
  const scoreDifference =
    Number(first.SIMILARITY) - Number(second?.SIMILARITY);

  if (!truncated && Number(first.MATCH_PRIORITY)!==1 && Number(first.SIMILARITY) >= 90 && scoreDifference >= 10) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  return {
    status: "AMBIGUOUS",
    ...metadata,
    query: search,
    options: members.map((member, index) => ({
      optionId: String(index + 1),
      documentNumber: String(member.COD_SOCIO),
      fullName: member.NOMBRE_COMPLETO,
      category: member.CATEGORIA,
      active: member.ACTIVO === "S",
    })),
  };
};
