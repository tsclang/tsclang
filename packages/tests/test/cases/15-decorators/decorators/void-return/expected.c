#include "runtime.h"

typedef struct { int _dummy; } Worker;

static void Worker_doWork_inner(const Worker *self) {
    (void)self;
    printf("work\n");
}

static void Worker_doWork(const Worker *self) {
    printf("enter\n");
    Worker_doWork_inner(self);
    printf("exit\n");
}

int main(void) {
    TSC_INIT();
    Worker w = {0};
    Worker_doWork(&w);
    return 0;
}
