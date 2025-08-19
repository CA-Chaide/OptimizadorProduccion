'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload } from 'lucide-react';

const importHistory = [
  {
    file: 'personnel_schedule_q3.csv',
    date: '2023-10-01',
    status: 'Completed',
  },
  {
    file: 'machine_output_2023_09.xlsx',
    date: '2023-09-30',
    status: 'Completed',
  },
  {
    file: 'absenteeism_report_sept.csv',
    date: '2023-09-29',
    status: 'Failed',
  },
  {
    file: 'production_targets_q4.csv',
    date: '2023-09-28',
    status: 'Completed',
  },
];

export default function DataImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Data Import</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload New Data</CardTitle>
            <CardDescription>
              Select a CSV or Excel file to import production data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="data-file">Data File</Label>
              <Input id="data-file" type="file" />
            </div>
          </CardContent>
          <CardFooter>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload and Process
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import History</CardTitle>
            <CardDescription>
              Recent data import jobs and their status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((item) => (
                  <TableRow key={item.file}>
                    <TableCell className="font-medium">{item.file}</TableCell>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === 'Completed' ? 'default' : 'destructive'
                        }
                        className={item.status === 'Completed' ? 'bg-green-500' : ''}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
