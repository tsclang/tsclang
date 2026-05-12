#include "runtime.h"

void bar(void) {
    printf("bar\n");
}

int main(void) {
    TSC_INIT();
    bar();
    return 0;
}
