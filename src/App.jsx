        const displayList = Object.values(unifiedGroups)
          .map(grp => {
            const invoice = grp.res;
            const comp = invoice ? computeBill(invoice) : null;
            
// STRICT DATE: Only match the date shown in the UI header
  const todayStrDhaka = new Intl.DateTimeFormat('en-GB', { 
    timeZone: 'Asia/Dhaka', 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  }).format(new Date());
  const reportDate = filter === "TODAY" ? todayStrDhaka : calDate;

            
            const todaysPayments = grp.txs.filter(t => t.date === reportDate);
            const paidInReportPeriod = todaysPayments.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

            const totalPaidEver = (invoice?.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const balanceDue = comp ? comp.total - totalPaidEver : 0;
            
            return { ...grp, paidInReportPeriod, balanceDue, status: invoice?.status };
          })
          .filter(grp => {
            // THE GHOST REMOVER: Only show if currently in room, owes money, or paid cash TODAY
            const isStaying = grp.status === "CHECKED_IN";
            const owesMoney = grp.balanceDue > 0;
            const paidToday = grp.paidInReportPeriod > 0;

            return isStaying || owesMoney || paidToday;
          });
