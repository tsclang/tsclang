#include "runtime.h"

typedef struct { String name; } _pick_name;

void logName__pick_name(_pick_name obj) {
    printf("%s\n", obj.name.data);
}

int main(void) {
    TSC_INIT();
    logName__pick_name((_pick_name){.name = STR_LIT("Alice")});
    return 0;
}
