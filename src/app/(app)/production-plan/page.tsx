import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusCircle, MoreHorizontal } from 'lucide-react';

const productionPlanData = [
  {
    task: 'Assemble Part A',
    startTime: '2023-10-10 08:00',
    endTime: '2023-10-10 12:00',
    assignedTo: 'John Doe',
    status: 'In Progress',
  },
  {
    task: 'Quality Check Part A',
    startTime: '2023-10-10 12:00',
    endTime: '2023-10-10 13:00',
    assignedTo: 'Jane Smith',
    status: 'Scheduled',
  },
  {
    task: 'Assemble Part B',
    startTime: '2023-10-10 09:00',
    endTime: '2023-10-10 14:00',
    assignedTo: 'Peter Jones',
    status: 'Completed',
  },
  {
    task: 'Final Assembly',
    startTime: '2023-10-10 14:00',
    endTime: '2023-10-10 17:00',
    assignedTo: 'Mary Johnson',
    status: 'Scheduled',
  },
  {
    task: 'Packaging',
    startTime: '2023-10-11 08:00',
    endTime: '2023-10-11 11:00',
    assignedTo: 'Team C',
    status: 'Blocked',
  },
];

const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-500';
      case 'In Progress':
        return 'bg-blue-500';
      case 'Scheduled':
        return 'bg-yellow-500 text-black';
      case 'Blocked':
        return 'bg-red-500';
      default:
        return 'default';
    }
}

export default function ProductionPlanPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Production Plan</h1>
        <Button size="sm" className="gap-1">
          <PlusCircle className="h-4 w-4" />
          Generate New Plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Week Schedule</CardTitle>
          <CardDescription>
            Optimized production plan based on current data and constraints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productionPlanData.map((plan) => (
                <TableRow key={plan.task}>
                  <TableCell className="font-medium">{plan.task}</TableCell>
                  <TableCell>{plan.startTime}</TableCell>
                  <TableCell>{plan.endTime}</TableCell>
                  <TableCell>{plan.assignedTo}</TableCell>
                  <TableCell>
                    <Badge variant="default" className={getStatusBadgeVariant(plan.status)}>
                      {plan.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button aria-haspopup="true" size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
