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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const absenteeismData = [
  {
    employee: 'John Doe',
    startDate: '2023-10-05',
    endDate: '2023-10-07',
    reason: 'Sick Leave',
  },
  {
    employee: 'Jane Smith',
    startDate: '2023-10-06',
    endDate: '2023-10-06',
    reason: 'Personal',
  },
  {
    employee: 'Peter Jones',
    startDate: '2023-10-09',
    endDate: '2023-10-12',
    reason: 'Vacation',
  },
  {
    employee: 'Mary Johnson',
    startDate: '2023-10-10',
    endDate: '2023-10-10',
    reason: 'Sick Leave',
  },
];

export default function AbsenteeismPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Absenteeism Management
        </h1>
        <Dialog>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                    <PlusCircle className="h-4 w-4" />
                    Log Absence
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                <DialogTitle>Log New Absence</DialogTitle>
                <DialogDescription>
                    Add a new absenteeism record here. Click save when you're done.
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                    Employee
                    </Label>
                    <Input id="name" value="John Doe" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="start-date" className="text-right">
                    Start Date
                    </Label>
                    <Input id="start-date" type="date" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="end-date" className="text-right">
                    End Date
                    </Label>
                    <Input id="end-date" type="date" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="reason" className="text-right">
                    Reason
                    </Label>
                    <Input id="reason" value="Sick Leave" className="col-span-3" />
                </div>
                </div>
                <DialogFooter>
                <Button type="submit">Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Absence Records</CardTitle>
          <CardDescription>
            A list of all recorded employee absences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {absenteeismData.map((absence) => (
                <TableRow key={absence.employee + absence.startDate}>
                  <TableCell className="font-medium">{absence.employee}</TableCell>
                  <TableCell>{absence.startDate}</TableCell>
                  <TableCell>{absence.endDate}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{absence.reason}</Badge>
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
