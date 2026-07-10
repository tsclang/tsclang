#include "runtime.h"

void run(void) {
    printf("native block\n");
    printf("after\n");
}

int main(void) {
    TSC_INIT();
    return 0;
}
